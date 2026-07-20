import { DEFAULT_TTS_PRESET_ID, getTtsPreset, type TtsPresetId } from "@/lib/tts-presets";

export const DEFAULT_TTS_PROVIDER = "mimo";
export const DEFAULT_MIMO_BASE_URL = "https://api.xiaomimimo.com/v1";
export const DEFAULT_TTS_MODEL = "mimo-v2.5-tts";
export const DEFAULT_TTS_VOICE = "Chloe";
export const DEFAULT_TTS_FORMAT = "mp3";
export const DEFAULT_TTS_STYLE = "Warm, friendly, natural American English tutor. Speak clearly at a relaxed pace, with gentle energy and conversational intonation.";

export type TtsFormat = "wav" | "mp3" | "pcm" | "pcm16";

export type TtsConfig = {
  provider: "mimo";
  configured: boolean;
  baseUrl: string;
  model: string;
  presetId: TtsPresetId;
  voice: string;
  format: TtsFormat;
  style: string;
};

export type TtsAudioResult = {
  bytes: Buffer;
  mimeType: string;
  config: TtsConfig;
};

export type TtsSynthesisOptions = {
  presetId?: string;
  voice?: string;
  style?: string;
};

export class TtsNotConfiguredError extends Error {
  constructor() {
    super("未配置 MiMo TTS。请在服务端设置 MIMO_API_KEY 后重试。");
    this.name = "TtsNotConfiguredError";
  }
}

function normalizeFormat(value: string | undefined): TtsFormat {
  if (value === "wav" || value === "mp3" || value === "pcm" || value === "pcm16") return value;
  return DEFAULT_TTS_FORMAT;
}

export function isTtsConfigured() {
  return Boolean(process.env.MIMO_API_KEY);
}

export function getTtsConfig(): TtsConfig {
  const preset = getTtsPreset(process.env.TTS_PRESET || DEFAULT_TTS_PRESET_ID);
  return {
    provider: "mimo",
    configured: isTtsConfigured(),
    baseUrl: (process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL).replace(/\/$/, ""),
    model: process.env.TTS_MODEL || DEFAULT_TTS_MODEL,
    presetId: preset.id,
    voice: process.env.TTS_VOICE || preset.voice || DEFAULT_TTS_VOICE,
    format: normalizeFormat(process.env.TTS_FORMAT),
    style: process.env.TTS_STYLE || preset.style || DEFAULT_TTS_STYLE,
  };
}

export function ttsMimeType(format: TtsFormat) {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  return "audio/pcm";
}

export async function synthesizeSpeech(text: string, options: TtsSynthesisOptions = {}): Promise<TtsAudioResult> {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) throw new TtsNotConfiguredError();

  const config = getTtsConfig();
  const preset = getTtsPreset(options.presetId || config.presetId);
  const voice = options.voice?.trim() || (options.presetId ? preset.voice : config.voice);
  const style = options.style?.trim() || (options.presetId ? preset.style : config.style);
  const requestConfig = { ...config, presetId: preset.id, voice, style };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: style,
        },
        {
          role: "assistant",
          content: text,
        },
      ],
      audio: {
        format: config.format,
        voice,
      },
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MiMo TTS 请求失败（${response.status}）。${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const audioData = payload?.choices?.[0]?.message?.audio?.data;
  if (typeof audioData !== "string" || audioData.length === 0) {
    throw new Error(`MiMo TTS 返回中没有音频数据。响应: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  return {
    bytes: Buffer.from(audioData, "base64"),
    mimeType: ttsMimeType(config.format),
    config: requestConfig,
  };
}