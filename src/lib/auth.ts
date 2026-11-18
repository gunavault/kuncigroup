import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";
import type { Role } from "@prisma/client";
import { effectiveRole } from "./roles";
const scrypt = promisify(scryptCallback);
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  name: string;
  email: string;
  superuser: boolean;
  grants: { companyId: string; role: Role; branchIds: string[]; managerId?: string | null; employeeId?: string | null }[];
  mustChangePassword: boolean;
};
export function matches(value: string, expected: string) {
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function passwordHash(password: string) {
  if (password.length < 16 || password.length > 256)
    throw new Error("Kata sandi harus 16–256 karakter.");
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, hash: string) {
  const [algorithm, salt, expected] = hash.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return matches(key.toString("hex"), expected);
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin"),
    url = new URL(req.url);
  // Only loopback/trusted private proxies reach this listener; they set these headers.
  const protocol =
    req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase() ??
    url.protocol.slice(0, -1);
  if (!["http", "https"].includes(protocol))
    throw new AccessError("Protokol proxy tidak valid.", 400);
  const expected = new URL(
    protocol + "://" + (req.headers.get("host") ?? url.host),
  ).origin;
  if (origin && origin !== expected)
    throw new AccessError("Origin tidak diizinkan.", 400);
}
export async function currentActor(): Promise<Actor | null> {
  if (process.env.NODE_ENV !== "production" && !process.env.APP_PASSWORD)
    return {
      id: "local-admin",
      name: "Administrator lokal",
      email: "local@localhost",
      superuser: true,
      grants: [],
      mustChangePassword: false,
    };
  const token = (await cookies()).get("kunci-session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.userSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { include: { grants: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    return null;
  const u = session.user;
  if(!u.isSuperuser&&!u.grants.some(g=>g.active))return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? u.username ?? "",
    superuser: u.isSuperuser,
    grants: u.grants.filter(g=>g.active).map((g) => ({
      companyId: g.companyId,
      role: g.role,
      branchIds: g.branchIds,
      managerId: g.managerId, employeeId: g.employeeId,
    })),
    mustChangePassword: u.mustChangePassword,
  };
}
export async function requireActor(allowInitialPassword = false) {
  const actor = await currentActor();
  if (!actor) throw new AccessError("Silakan login.", 401);
  if (actor.mustChangePassword && !allowInitialPassword)
    throw new AccessError("Ganti kata sandi awal terlebih dahulu.", 428);
  return actor;
}
export function assignedRole(actor: Actor, companyId: string): Role {
  if (actor.superuser) return "ADMIN";
  const grant = actor.grants.find((g) => g.companyId === companyId);
  if (!grant) throw new AccessError("Tidak memiliki akses ke perusahaan ini.");
  return grant.role;
}
export function companyRole(actor: Actor, companyId: string): Role {
  return effectiveRole(assignedRole(actor, companyId));
}
export function authorizeCompany(
  actor: Actor,
  companyId: string,
  roles?: Role[],
  branchId?: string | null,
) {
  const role = companyRole(actor, companyId);
  if (roles && !roles.includes(role))
    throw new AccessError("Peran Anda tidak diizinkan melakukan tindakan ini.");
  const g = actor.grants.find((g) => g.companyId === companyId);
  if (
    !actor.superuser &&
    g?.branchIds.length &&
    branchId !== undefined &&
    (!branchId || !g.branchIds.includes(branchId))
  )
    throw new AccessError("Cabang di luar cakupan akses.");
  return role;
}
export const allowedBranches = (actor: Actor, companyId: string) =>
  actor.superuser
    ? []
    : (actor.grants.find((g) => g.companyId === companyId)?.branchIds ?? []);
export async function authorized() {
  return !!(await currentActor());
}
export async function requireAuth() {
  await requireActor();
}
export async function newSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.userSession.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  return token;
}
export async function bootstrapAdministrator() {
  const email = process.env.BOOTSTRAP_EMAIL ?? "admin@kuncigroup.cloud";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 16)
    throw new Error(
      "APP_PASSWORD minimal 16 karakter diperlukan untuk akun administrator pertama.",
    );
  return db.user.create({
    data: {
      email,
      name: "Administrator Kunci Group",
      passwordHash: await passwordHash(process.env.APP_PASSWORD),
      isSuperuser: true,
      mustChangePassword: false,
    },
  });
}
