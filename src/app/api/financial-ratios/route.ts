import { NextResponse } from "next/server";
import { requireActor, AccessError } from "@/lib/auth";
import { financialRatios } from "@/lib/financial-ratios";
import { apiFail } from "@/lib/api-error";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(true);
    if (actor.mustChangePassword) throw new AccessError("Ganti kata sandi awal.", 428);
    const p = new URL(request.url).searchParams, company = p.get("company"), period = p.get("period");
    if (!company || !period) throw new Error("Perusahaan dan periode wajib dipilih.");
    return NextResponse.json(await financialRatios(actor, company, period), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFail(error); }
}
