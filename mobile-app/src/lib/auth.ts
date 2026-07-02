import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "speakmate_session";

type AuthMode = "configured" | "disabled" | "missing";

export function getAuthMode(): AuthMode {
  if (process.env.APP_AUTH_DISABLED === "true") return "disabled";
  if (
    process.env.APP_ACCESS_PASSWORD &&
    process.env.APP_ACCESS_PASSWORD.length >= 8 &&
    process.env.APP_SESSION_SECRET &&
    process.env.APP_SESSION_SECRET.length >= 32
  ) return "configured";
  return "missing";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value: string) {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function verifyPassword(password: string) {
  const expected = process.env.APP_ACCESS_PASSWORD;
  return Boolean(expected && safeEqual(password, expected));
}

export function createSessionToken() {
  const ttlDays = Number(process.env.APP_SESSION_TTL_DAYS || 30);
  const expiresAt = Date.now() + Math.max(1, Math.min(ttlDays, 90)) * 24 * 60 * 60 * 1000;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const [version, expiresAtText, signature] = token.split(".");
  if (version !== "v1" || !expiresAtText || !signature) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const payload = `${version}.${expiresAtText}`;
  return safeEqual(signature, sign(payload));
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return decodeURIComponent(item.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function isRequestAuthenticated(request: Request) {
  const mode = getAuthMode();
  if (mode === "disabled") return true;
  if (mode === "missing") return false;
  return verifySessionToken(readCookie(request, SESSION_COOKIE));
}

export function sessionMaxAgeSeconds() {
  const ttlDays = Number(process.env.APP_SESSION_TTL_DAYS || 30);
  return Math.max(1, Math.min(ttlDays, 90)) * 24 * 60 * 60;
}

export function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}
