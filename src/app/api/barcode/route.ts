import { requireActor, authorizeCompany, allowedBranches } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiFail } from "@/lib/api-error";
import bwipjs from "bwip-js/node";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await requireActor(),
      p = new URL(req.url).searchParams,
      companyId = p.get("company") ?? "KBA",
      text = p.get("text") ?? "";
    authorizeCompany(actor, companyId);
    if (!/^[\x20-\x7E]{1,100}$/.test(text))
      throw new Error("Kode label harus 1–100 karakter ASCII.");
    const branches = allowedBranches(actor, companyId);
    const master = await db.masterRecord.findFirst({
      where: {
        companyId,
        kind: { in: ["PRODUCT", "ASSET"] },
        ...(branches.length
          ? { OR: [{ branchId: { in: branches } }, { branchId: null }] }
          : {}),
        AND: [
          {
            OR: [
              { code: text },
              { id: text },
              { data: { path: ["barcode"], equals: text } },
            ],
          },
        ],
      },
    });
    if (!master) throw new Error("Master barcode tidak ditemukan.");
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 3,
      height: 14,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF",
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiFail(e);
  }
}
