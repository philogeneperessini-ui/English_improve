import { NextResponse } from "next/server";
import { protectApi } from "@/lib/api-protection";
import { AsrNotConfiguredError, asrFallbackResponse, transcribeAudio } from "@/lib/asr";

// 练习一次回答最多几分钟，对话通常更短。20MB 已足够，且在 Vercel serverless 限制内。
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const blocked = protectApi(request, "transcribe", 30);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不正确，请上传音频文件。" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "未找到音频文件。" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "音频为空，请重新录制。" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "音频过长，请缩短录音后再试。" }, { status: 413 });
  }

  try {
    const result = await transcribeAudio(file);
    return NextResponse.json(result);
  } catch (cause) {
    if (cause instanceof AsrNotConfiguredError) return asrFallbackResponse(cause);
    return asrFallbackResponse(cause);
  }
}
