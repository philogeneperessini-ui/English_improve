import { NextResponse } from "next/server";
import { getAuthMode, isRequestAuthenticated } from "@/lib/auth";
import { consumeRateLimit, requestFingerprint } from "@/lib/rate-limit";

export function protectApi(
  request: Request,
  scope: string,
  limit = 40,
  windowMs = 10 * 60 * 1000,
) {
  if (getAuthMode() === "missing") {
    return NextResponse.json(
      { error: "服务端登录保护尚未配置。" },
      { status: 503 },
    );
  }
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const rateLimit = consumeRateLimit(
    `${scope}:${requestFingerprint(request)}`,
    limit,
    windowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "请求较频繁，请稍后再试。" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  return null;
}
