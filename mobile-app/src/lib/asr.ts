import { NextResponse } from "next/server";

/**
 * ASR（语音转文字）适配层。
 *
 * 当前默认使用硅基流动 SiliconFlow 的 FunAudioLLM/SenseVoiceSmall，
 * 它兼容 OpenAI /v1/audio/transcriptions 接口、对中英文都不错且有免费额度。
 *
 * 设计成可扩展结构：以后接入 MiMo-ASR、阿里 Paraformer 等，
 * 只需在 transcribeAudio 里按 ASR_PROVIDER 分支即可，路由和前端不变。
 *
 * 所有 Key 只在服务端读取，永远不进入浏览器或 APK。
 */

export type AsrResult = {
  text: string;
  source: "siliconflow" | "demo";
};

export const DEFAULT_ASR_MODEL = "FunAudioLLM/SenseVoiceSmall";

export class AsrNotConfiguredError extends Error {
  constructor() {
    super("未配置语音转写服务。请在服务端设置 SILICONFLOW_API_KEY 后重试。");
    this.name = "AsrNotConfiguredError";
  }
}

export function isAsrConfigured() {
  return Boolean(process.env.SILICONFLOW_API_KEY);
}

export function getAsrConfig() {
  return {
    configured: isAsrConfigured(),
    baseUrl: (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, ""),
    model: process.env.ASR_MODEL || DEFAULT_ASR_MODEL,
  };
}

/**
 * 判断要处理的音频是否需要转码。
 * 浏览器 MediaRecorder 通常输出 webm/opus，硅基流动支持该格式，可直接上传。
 * 此函数为后续可能出现的不兼容格式（如 Safari 的 mp4）预留转码点。
 */
function pickUploadFilename(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("webm")) return "audio.webm";
  if (type.includes("ogg")) return "audio.ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "audio.m4a";
  if (type.includes("mp3") || type.includes("mpeg")) return "audio.mp3";
  if (type.includes("wav")) return "audio.wav";
  return "audio.webm";
}

async function transcribeWithSiliconFlow(blob: Blob): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new AsrNotConfiguredError();

  const baseUrl = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const model = process.env.ASR_MODEL || "FunAudioLLM/SenseVoiceSmall";

  // OpenAI 兼容接口：multipart/form-data，字段 file / model / language
  const form = new FormData();
  form.append("file", blob, pickUploadFilename(blob));
  form.append("model", model);
  form.append("language", "en");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`语音转写请求失败（${response.status}）。${detail.slice(0, 200)}`);
  }

  // SiliconFlow 默认返回纯文本或 JSON；两种都兼容
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { text?: string };
    return (payload.text || "").trim();
  }
  const text = await response.text();
  return text.trim();
}

/**
 * 把一段音频转成文字。供 /api/transcribe 路由调用。
 * 失败时抛错，由路由决定降级策略。
 */
export async function transcribeAudio(blob: Blob): Promise<AsrResult> {
  if (!isAsrConfigured()) throw new AsrNotConfiguredError();
  const text = await transcribeWithSiliconFlow(blob);
  return { text, source: "siliconflow" };
}

/**
 * ASR 未配置或失败时的统一降级响应，保持前端体验一致。
 */
export function asrFallbackResponse(cause: unknown) {
  const isMissing = cause instanceof AsrNotConfiguredError;
  const message = isMissing
    ? "语音转写未配置，请手动输入文字后再提交。"
    : cause instanceof Error
      ? cause.message
      : "语音转写失败，请手动输入文字后再提交。";
  return NextResponse.json({ text: "", source: "demo" as const, error: message });
}
