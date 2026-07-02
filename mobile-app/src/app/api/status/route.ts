import { NextResponse } from "next/server";
import { protectApi } from "@/lib/api-protection";

export async function GET(request: Request) {
  const blocked = protectApi(request, "status", 120);
  if (blocked) return blocked;

  return NextResponse.json({
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
    transcriptionMode: "browser",
    pronunciationConfigured: false,
  });
}
