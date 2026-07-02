import { NextResponse } from "next/server";
import { getAuthMode, isRequestAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  const mode = getAuthMode();
  return NextResponse.json({
    configured: mode !== "missing",
    authEnabled: mode === "configured",
    authenticated: isRequestAuthenticated(request),
  });
}
