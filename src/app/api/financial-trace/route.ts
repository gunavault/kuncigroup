import { NextResponse } from "next/server";
import { requireActor, AccessError } from "@/lib/auth";
import { apiFail } from "@/lib/api-error";
import { financialTrace } from "@/lib/financial-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(true);
    if (actor.mustChangePassword) throw new AccessError("Ganti kata sandi awal.", 428);
    const p = new URL(request.url).searchParams;
    const company = p.get("company"), period = p.get("period");
    if (!company || !period) throw new Error("Perusahaan dan periode wajib dipilih.");
    const page = p.get("page") ?? "0";
    if (!/^\d{1,6}$/.test(page)) throw new Error("Halaman tidak valid.");
    return NextResponse.json(await financialTrace(actor, {
      company, period, page: Number(page), statement: p.get("statement") ?? undefined,
      metric: p.get("metric") ?? undefined, account: p.get("account") || undefined,
      journal: p.get("journal") || undefined, document: p.get("document") || undefined,
      entryType: p.get("entryType") || undefined,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFail(error); }
}
