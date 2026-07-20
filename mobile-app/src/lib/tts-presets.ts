export type TtsPresetId =
  | "warm_tutor"
  | "bright_partner"
  | "slow_clarity"
  | "interview_coach"
  | "casual_male";

export type TtsPreset = {
  id: TtsPresetId;
  label: string;
  subtitle: string;
  voice: "Mia" | "Chloe" | "Milo" | "Dean";
  style: string;
};

export const DEFAULT_TTS_PRESET_ID: TtsPresetId = "warm_tutor";

export const ttsPresets = [
  {
    id: "warm_tutor",
    label: "温柔老师",
    subtitle: "清楚、鼓励",
    voice: "Chloe",
    style: "Warm, friendly, natural American English tutor. Speak clearly at a relaxed pace, with gentle energy and conversational intonation.",
  },
  {
    id: "bright_partner",
    label: "活力伙伴",
    subtitle: "轻快、自然",
    voice: "Mia",
    style: "Bright, upbeat, conversational English-speaking friend. Keep a lively rhythm, natural smiles in the voice, and avoid sounding formal.",
  },
  {
    id: "slow_clarity",
    label: "慢速纠音",
    subtitle: "慢一点、咬字清",
    voice: "Chloe",
    style: "Patient pronunciation coach. Speak slightly slower than normal, with crisp articulation, soft pauses, and a calm reassuring tone.",
  },
  {
    id: "interview_coach",
    label: "面试教练",
    subtitle: "稳重、专业",
    voice: "Dean",
    style: "Professional interview coach. Speak with steady confidence, clear pacing, and supportive authority, like helping someone prepare for a real meeting.",
  },
  {
    id: "casual_male",
    label: "男声朋友",
    subtitle: "放松、口语",
    voice: "Milo",
    style: "Relaxed male English conversation partner. Sound casual, warm, and easygoing, like a friend chatting over coffee.",
  },
] as const satisfies readonly TtsPreset[];

export function getTtsPreset(id: string | undefined): TtsPreset {
  return ttsPresets.find((preset) => preset.id === id) ?? ttsPresets[0];
}
