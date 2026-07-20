import { NextResponse } from "next/server";
import { protectApi } from "@/lib/api-protection";
import { getAsrConfig } from "@/lib/asr";
import { getTtsConfig } from "@/lib/tts";

export async function GET(request: Request) {
  const blocked = protectApi(request, "status", 120);
  if (blocked) return blocked;

  const asr = getAsrConfig();
  const tts = getTtsConfig();

  return NextResponse.json({
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
    siliconflowConfigured: Boolean(process.env.SILICONFLOW_API_KEY),
    transcriptionMode: asr.configured ? "siliconflow" : "browser",
    asrModel: asr.model,
    speechMode: tts.configured ? tts.provider : "browser",
    ttsConfigured: tts.configured,
    ttsProvider: tts.provider,
    ttsModel: tts.model,
    ttsVoice: tts.voice,
    pronunciationConfigured: false,
  });
}
