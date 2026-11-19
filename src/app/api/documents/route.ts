import { requireActor, authorizeCompany, AccessError } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiFail } from "@/lib/api-error";
import { documentPdf } from "@/lib/document-pdf";
import { definitions } from "@/lib/operations/registry";
import { object, str } from "@/lib/operations/shared";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await requireActor(),
      p = new URL(req.url).searchParams,
      companyId = p.get("company") ?? "KBA";
    authorizeCompany(actor, companyId);
    const r = await db.businessRecord.findFirstOrThrow({
        where: { companyId, id: p.get("id") ?? "" },
        include: { lines: true },
      }),
      role = authorizeCompany(actor, companyId, undefined, r.branchId);
    if (
      (role === "STAFF" && r.actorId !== actor.id) ||
      (role === "HR" &&
        !["attendances", "shifts", "timesheets", "project", "quality"].includes(
          r.module,
        ))
    )
      throw new AccessError("Dokumen di luar cakupan akses.");
    const company = await db.company.findUniqueOrThrow({
        where: { id: companyId },
      }),
      branch = r.branchId
        ? await db.branch.findUnique({ where: { id: r.branchId } })
        : null,
      def = definitions.find((d) => d.key === r.module),
      data = object(r.data);
    const refs = await db.masterRecord.findMany({
      where: {
        companyId,
        id: {
          in: Object.values(data).filter(
            (v): v is string => typeof v === "string",
          ),
        },
      },
    });
    const fields = (def?.fields ?? [])
      .filter(
        (f) =>
          data[f.key] !== undefined &&
          data[f.key] !== "" &&
          f.key !== "attachmentId",
      )
      .map((f) => ({
        label: f.label,
        value: refs.find((m) => m.id === data[f.key])?.name ?? str(data[f.key]),
      }));
    for (const [key, label] of [
      ["lateMinutes", "Keterlambatan (menit)"],
      ["expectedCash", "Kas penjualan diharapkan (IDR)"],
      ["variance", "Selisih kas (IDR)"],
      ["opsVerifiedName", "Diverifikasi OPS oleh"],
      ["approvedName", "Disetujui oleh"],
      ["approvalTier", "Tingkat persetujuan"],
    ] as const)
      if (data[key] !== undefined)
        fields.push({ label, value: str(data[key]) });
    const feeProducts = new Set(
      (
        await db.masterRecord.findMany({
          where: {
            companyId,
            kind: "PRODUCT",
            id: {
              in: r.lines
                .map((l) => l.productId)
                .filter((v): v is string => Boolean(v)),
            },
          },
          select: { id: true, data: true },
        })
      )
        .filter((p) => object(p.data).managementFee === true)
        .map((p) => p.id),
    );
    const bytes = await documentPdf({
      company: company.name,
      branch: branch?.name ?? "Perusahaan",
      module: def?.name ?? r.module,
      number: r.number,
      title: r.title,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      amount: r.amount.toString(),
      settled: r.settled.toString(),
      fields,
      lines: r.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        total: l.total.toString(),
        group:
          l.productId && feeProducts.has(l.productId)
            ? "Management Fee"
            : undefined,
      })),
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${r.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiFail(e);
  }
}
