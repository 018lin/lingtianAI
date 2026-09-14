import { NextResponse } from "next/server";
import {
  adminCookieName,
  adminCookieOptions,
  createAdminSession,
  isAdminPasswordValid
} from "@/lib/admin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;

  if (!body?.password || !isAdminPasswordValid(body.password)) {
    return NextResponse.json({ error: "管理员密码不正确。" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, createAdminSession(), adminCookieOptions);
  return response;
}
