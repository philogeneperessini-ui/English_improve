import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  getAuthMode,
  isSecureRequest,
  SESSION_COOKIE,
  sessionMaxAgeSeconds,
  verifyPassword,
} from "@/lib/auth";
import { consumeRateLimit, requestFingerprint } from "@/lib/rate-limit";

const requestSchema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const mode = getAuthMode();
  if (mode === "missing") {
    return NextResponse.json(
      { error: "服务端尚未配置 APP_ACCESS_PASSWORD 和 APP_SESSION_SECRET。" },
      { status: 503 },
    );
  }
  if (mode === "disabled") {
    return NextResponse.json({ authenticated: true, authEnabled: false });
  }

  const fingerprint = requestFingerprint(request);
  const rateLimit = consumeRateLimit(`login:${fingerprint}`, 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `尝试次数过多，请在 ${rateLimit.retryAfterSeconds} 秒后重试。` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "密码不正确。" }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true, authEnabled: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  });
  return response;
}
