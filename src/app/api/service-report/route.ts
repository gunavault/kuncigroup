import { NextResponse } from "next/server";
import { requireActor, checkOrigin } from "@/lib/auth";
import { apiFail } from "@/lib/api-error";
import { serviceReport } from "@/lib/service-report";
import { saveServicePlan } from "@/lib/service-plans";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const actor = await requireActor(), p = new URL(request.url).searchParams, company = p.get("company"), period = p.get("period"); if (!company || !period) throw Error("Pilih perusahaan dan periode."); const page = p.get("stockPage") ?? "0"; if (!/^\d{1,6}$/.test(page)) throw Error("Halaman stok tidak valid."); return NextResponse.json(await serviceReport(actor, company, period, Number(page)), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiFail(error); }
}
export async function POST(request: Request) {
  try { const actor = await requireActor(); checkOrigin(request); if (Number(request.headers.get("content-length")) > 1024 * 1024) throw Error("Rencana terlalu besar."); return NextResponse.json(await saveServicePlan(actor, await request.json())); } catch (error) { return apiFail(error); }
}
