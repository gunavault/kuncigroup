import { z } from "zod";
import { db } from "../db";
import {
  authorizeCompany,
  allowedBranches,
  passwordHash,
  type Actor,
} from "../auth";
import { atomic, json, object, str } from "./shared";
import { audit } from "./engine";
import { modules } from "./registry";
import { normalizeApprovalSettings } from "./approval";
import {manageUsers} from './users';
import { validateRatioMapping } from "../ratio-mapping";
import { saveRatioMapping } from "../ratio-mapping-review";
export async function manageSettings(actor: Actor, input: unknown) {
  const s = object(input),
    action = str(s.action),
    companyId = str(s.companyId);
  if(['user','grant','companyAccess','resetPassword','userProfile'].includes(action))return manageUsers(actor,input);
  if(action==='ratioMapping')return saveRatioMapping(actor,s);
  authorizeCompany(actor, companyId, ["ADMIN"]);
  if (allowedBranches(actor, companyId).length)
    throw new Error(
      "Administrasi perusahaan memerlukan cakupan seluruh cabang.",
    );
  if (action === "user") {
    const u = z
      .object({
        email: z.email(),
        name: z.string().min(2).max(150),
        password: z.string().min(16).max(256),
        role: z.enum([
          "ADMIN",
          "MANAGER",
          "FINANCE",
          "HR",
          "SUPERVISOR",
          "STAFF",
          "AUDITOR",
        ]),
        branchIds: z.array(z.string()).max(100).default([]),
      })
      .parse(s.data);
    return atomic(companyId, async (tx) => {
      if (await tx.user.findUnique({ where: { email: u.email.toLowerCase() } }))
        throw new Error(
          "Email sudah terdaftar; ubah akses pengguna melalui aksi grant.",
        );
      for (const id of u.branchIds)
        await tx.branch.findFirstOrThrow({ where: { id, companyId } });
      const user = await tx.user.create({
        data: {
          email: u.email.toLowerCase(),
          name: u.name,
          passwordHash: await passwordHash(u.password),
          grants: {
            create: { companyId, role: u.role, branchIds: u.branchIds },
          },
          mustChangePassword: true,
        },
      });
      await audit(tx, actor, companyId, "USER_CREATED", user.id, {
        email: user.email,
        role: u.role,
      });
      return { id: user.id, email: user.email };
    });
  }
  if (action === "grant") {
    const d = z
      .object({
        userId: z.string(),
        role: z.enum([
          "ADMIN",
          "MANAGER",
          "FINANCE",
          "HR",
          "SUPERVISOR",
          "STAFF",
          "AUDITOR",
        ]),
        branchIds: z.array(z.string()).max(100).default([]),
      })
      .parse(s.data);
    return atomic(companyId, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: d.userId } });
      if (user.isSuperuser && !actor.superuser)
        throw new Error("Akun pemilik hanya dapat dikelola pemilik.");
      if (
        !actor.superuser &&
        !(await tx.accessGrant.count({
          where: { userId: d.userId, companyId },
        }))
      )
        throw new Error("Pengguna di luar perusahaan.");
      for (const id of d.branchIds)
        await tx.branch.findFirstOrThrow({ where: { id, companyId } });
      const grant = await tx.accessGrant.upsert({
        where: { userId_companyId: { userId: d.userId, companyId } },
        create: { companyId, ...d },
        update: { role: d.role, branchIds: d.branchIds },
      });
      await tx.userSession.deleteMany({ where: { userId: d.userId } });
      await audit(tx, actor, companyId, "ACCESS_UPDATED", d.userId, {
        role: d.role,
        branches: d.branchIds,
      });
      return grant;
    });
  }
  if (action === "userActive") {
    if (!actor.superuser)
      throw new Error(
        "Status akun global hanya dapat diubah pemilik. Ubah akses perusahaan melalui formulir hak akses.",
      );
    const d = object(s.data);
    return atomic(companyId, async (tx) => {
      const u = await tx.user.findUniqueOrThrow({
        where: { id: str(d.userId) },
      });
      if (u.isSuperuser || u.id === actor.id)
        throw new Error(
          "Akun pemilik atau akun sendiri tidak dapat dinonaktifkan dari sini.",
        );
      if (
        !actor.superuser &&
        !(await tx.accessGrant.count({ where: { companyId, userId: u.id } }))
      )
        throw new Error("Akun di luar perusahaan.");
      await tx.user.update({
        where: { id: u.id },
        data: { active: d.active === true },
      });
      await tx.userSession.deleteMany({ where: { userId: u.id } });
      await audit(tx, actor, companyId, "USER_STATUS_UPDATED", u.id, {
        active: d.active === true,
      });
    });
  }
  if (action === "branch") {
    const b = z
      .object({
        id: z.string().optional(),
        code: z.string().regex(/^[A-Z0-9_-]{1,30}$/),
        name: z.string().min(2).max(150),
        address: z.string().max(500).default(""),
        latitude: z.number().min(-90).max(90).nullable().default(null),
        longitude: z.number().min(-180).max(180).nullable().default(null),
        radius: z.number().int().min(10).max(10000).default(200),
      })
      .parse(s.data);
    return atomic(companyId, async (tx) => {
      if (b.id)
        await tx.branch.findFirstOrThrow({ where: { id: b.id, companyId } });
      const { id, ...data } = b;
      const result = id
        ? await tx.branch.update({ where: { id }, data })
        : await tx.branch.create({ data: { ...data, companyId } });
      await audit(tx, actor, companyId, "BRANCH_SAVED", result.id);
      return result;
    });
  }
  if (action === "module") {
    const d = object(s.data),
      key = str(d.key);
    if (
      !modules.some((m) => m.key === key) ||
      ["settings", "apps", "accounting", "discuss"].includes(key)
    )
      throw new Error("Modul inti tidak dapat dinonaktifkan.");
    return atomic(companyId, async (tx) => {
      if (d.enabled === false) {
        const dependents = modules.filter((m) => m.dependencies?.includes(key));
        for (const dep of dependents) {
          const setting = await tx.moduleSetting.findUnique({
            where: { companyId_key: { companyId, key: dep.key } },
          });
          if (setting?.enabled !== false)
            throw new Error(`Nonaktifkan ${dep.name} lebih dahulu.`);
        }
      } else
        for (const dep of modules.find((m) => m.key === key)?.dependencies ??
          []) {
          const setting = await tx.moduleSetting.findUnique({
            where: { companyId_key: { companyId, key: dep } },
          });
          if (setting?.enabled === false)
            throw new Error(`Aktifkan ${dep} lebih dahulu.`);
        }
      const result = await tx.moduleSetting.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, enabled: d.enabled === true },
        update: { enabled: d.enabled === true },
      });
      await audit(tx, actor, companyId, "MODULE_TOGGLED", key, {
        enabled: d.enabled === true,
      });
      return result;
    });
  }
  if (action === "company") {
    if (!actor.superuser)
      throw new Error("Pengaturan perusahaan memerlukan akun pemilik.");
    const d = z
      .object({
        name: z.string().min(3).max(150),
        active: z.boolean(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(s.data);
    return atomic(
      companyId,
      async (tx) => {
        if (d.settings) {
          if (d.settings.approval !== undefined)
            d.settings.approval = normalizeApprovalSettings(
              d.settings.approval,
            );
          const map = object(d.settings.accounting);
          if (map.ratios !== undefined) map.ratios = validateRatioMapping(map.ratios, await tx.account.findMany({ select: { id: true, category: true } }));
          for (const id of Object.values(map).flat())
            if (typeof id === "string")
              await tx.account.findUniqueOrThrow({ where: { id } });
        }
        const result = await tx.company.update({
          where: { id: companyId },
          data: {
            name: d.name,
            active: d.active,
            ...(d.settings ? { settings: json(d.settings) } : {}),
          },
        });
        await audit(tx, actor, companyId, "COMPANY_UPDATED", companyId);
        return result;
      },
      true,
    );
  }
  throw new Error("Pengaturan tidak dikenal.");
}
export async function changePassword(actor: Actor, input: unknown) {
  const d = z
    .object({
      currentPassword: z.string().max(256),
      newPassword: z.string().min(16).max(256),
    })
    .parse(input);
  const { passwordMatches } = await import("../auth");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (d.currentPassword === d.newPassword)
    throw new Error("Kata sandi baru harus berbeda.");
  if (!(await passwordMatches(d.currentPassword, user.passwordHash)))
    throw new Error("Kata sandi lama salah.");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: {
        passwordHash: await passwordHash(d.newPassword),
        mustChangePassword: false,
      },
    });
    await tx.userSession.deleteMany({ where: { userId: actor.id } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "PASSWORD_CHANGED",
        entityId: actor.id,
        details: {},
      },
    });
  });
}
