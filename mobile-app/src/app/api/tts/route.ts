import { NextResponse } from "next/server";
import { z } from "zod";
import { protectApi } from "@/lib/api-protection";
import { synthesizeSpeech, TtsNotConfiguredError } from "@/lib/tts";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(1_200),
  presetId: z.string().trim().max(80).optional(),
  voice: z.string().trim().max(80).optional(),
  style: z.string().trim().max(1_000).optional(),
});

export async function POST(request: Request) {
  const blocked = protectApi(request, "tts", 80);
  if (blocked) return blocked;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "TTS 请求格式不正确。" }, { status: 400 });
  }

  try {
    const result = await synthesizeSpeech(parsed.data.text, {
      presetId: parsed.data.presetId,
      voice: parsed.data.voice,
      style: parsed.data.style,
    });
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Cache-Control": "no-store",
        "X-TTS-Provider": result.config.provider,
        "X-TTS-Model": result.config.model,
        "X-TTS-Preset": result.config.presetId,
        "X-TTS-Voice": result.config.voice,
      },
    });
  } catch (cause) {
    if (cause instanceof TtsNotConfiguredError) {
      return NextResponse.json({ error: cause.message }, { status: 503 });
    }
    const message = cause instanceof Error ? cause.message : "TTS 合成失败。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}