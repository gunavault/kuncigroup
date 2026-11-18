import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  checkOrigin,
  passwordMatches,
  newSession,
  tokenHash,
  currentActor,
  bootstrapAdministrator,
  AccessError,
} from "@/lib/auth";
import { cookies } from "next/headers";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 4096)
      throw new Error("Permintaan terlalu besar.");
    const { password, email } = await req.json();
    if (typeof password !== "string" || password.length > 256)
      throw new Error("Login gagal.");
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const key = `${ip}:${String(email ?? "admin").toLowerCase()}`;
    const record = attempts.get(key);
    if (record && record.until > Date.now() && record.count >= 10)
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Tunggu 15 menit." },
        { status: 429 },
      );
    const loginEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : (process.env.BOOTSTRAP_EMAIL ?? "admin@kuncigroup.cloud");
    let user = await db.user.findFirst({ where: { OR: [{ email: loginEmail }, { username: loginEmail }] } });
    if (
      !user &&
      loginEmail === (process.env.BOOTSTRAP_EMAIL ?? "admin@kuncigroup.cloud")
    )
      user = await bootstrapAdministrator();
    if (
      !user ||
      !user.active ||
      (!user.isSuperuser && !(await db.accessGrant.count({where:{userId:user.id,active:true}}))) ||
      !(await passwordMatches(password, user.passwordHash))
    ) {
      if (attempts.size > 2000) attempts.clear();
      attempts.set(key, {
        count: record && record.until > Date.now() ? record.count + 1 : 1,
        until: Date.now() + 900000,
      });
      return NextResponse.json(
        { error: "Identitas atau kata sandi salah, atau akses belum aktif." },
        { status: 401 },
      );
    }
    attempts.delete(key);
    const token = await newSession(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("kunci-session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 28800,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AccessError ? e.message : "Login gagal." },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
export async function GET() {
  const actor = await currentActor();
  return NextResponse.json(
    { actor },
    { status: actor ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
}
export async function DELETE(req: Request) {
  checkOrigin(req);
  const token = (await cookies()).get("kunci-session")?.value;
  if (token)
    await db.userSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("kunci-session");
  return response;
}
