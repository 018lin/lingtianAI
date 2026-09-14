import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "lt_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function isValidSignature(input: string, expected: string) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export function isAdminPasswordValid(password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword || !password) {
    return false;
  }

  const input = Buffer.from(password);
  const expected = Buffer.from(configuredPassword);

  return input.length === expected.length && timingSafeEqual(input, expected);
}

export function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function isAdminSessionValid(value: string | undefined) {
  if (!value) {
    return false;
  }

  const [expiresAt, signature] = value.split(".");

  if (!expiresAt || !signature || Number.isNaN(Number(expiresAt))) {
    return false;
  }

  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return false;
  }

  return isValidSignature(signature, sign(expiresAt));
}

export async function requireAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!isAdminSessionValid(session)) {
    throw new Error("管理员密码校验未通过。");
  }
}

export const adminCookieName = ADMIN_COOKIE;
export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};
