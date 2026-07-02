import { z } from "zod";
import { analyzeSpeech } from "@/lib/metrics";
import type { Evaluation, Question, SpeechMetrics } from "@/lib/types";

const score = z.number().min(0).max(9);

export const evaluationSchema = z.object({
  overall: score,
  summary: z.string().min(1),
  scores: z.object({
    fluency: score,
    vocabulary: score,
    grammar: score,
    relevance: score,
  }),
  pronunciation: z.object({
    score: score.nullable(),
    note: z.string(),
  }),
  strengths: z.array(z.string()).min(1).max(4),
  improvements: z
    .array(
      z.object({
        title: z.string(),
        evidence: z.string(),
        suggestion: z.string(),
      }),
    )
    .min(1)
    .max(4),
  improvedAnswer: z.string().min(1),
  nextFocus: z.string().min(1),
});

const fillerWords = new Set(["um", "uh", "like", "actually", "basically"]);

export function createDemoEvaluation(
  transcript: string,
  question: Question,
  durationSeconds: number,
  suppliedMetrics?: SpeechMetrics,
  notice?: string,
): Evaluation {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const lowerWords = words.map((word) => word.toLowerCase().replace(/[^a-z']/g, ""));
  const uniqueRatio = new Set(lowerWords).size / Math.max(words.length, 1);
  const metrics = suppliedMetrics ?? analyzeSpeech(transcript, durationSeconds);
  const fillers = Math.max(
    metrics.fillerCount,
    lowerWords.filter((word) => fillerWords.has(word)).length,
  );
  const sentences = transcript.split(/[.!?]+/).filter((item) => item.trim().length > 0);
  const wordsPerMinute = metrics.wordsPerMinute;

  const relevance = Math.min(7.5, 4.8 + Math.min(words.length / 45, 2.2));
  const vocabulary = Math.min(7.5, 4.7 + uniqueRatio * 2.4);
  const grammar = Math.min(7.5, 5 + Math.min(sentences.length / 4, 1.7));
  const pacePenalty = wordsPerMinute < 75 || wordsPerMinute > 190 ? 0.7 : 0;
  const fluency = Math.max(
    4,
    Math.min(7.5, 6.5 - fillers * 0.18 - metrics.repetitionCount * 0.15 - metrics.pauseCount * 0.08 - pacePenalty),
  );
  const values = [relevance, vocabulary, grammar, fluency];
  const overall = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rounded = (value: number) => Math.round(value * 2) / 2;

  const shortAnswer = words.length < (question.part === 1 ? 25 : 55);
  const improvedAnswer = shortAnswer
    ? `${transcript.trim()} To develop this idea further, I would add a specific example and explain why it matters to me. That would make the answer clearer, more personal, and easier to follow.`
    : transcript.trim();

  return {
    overall: rounded(overall),
    summary: shortAnswer
      ? "表达基本清楚，但观点展开不足。下一次加入一个具体例子，再解释它与你的关系。"
      : "回答结构清晰，已经能自然展开观点。下一步减少重复，并让例子更具体。",
    scores: {
      fluency: rounded(fluency),
      vocabulary: rounded(vocabulary),
      grammar: rounded(grammar),
      relevance: rounded(relevance),
    },
    pronunciation: {
      score: null,
      note: "当前版本尚未接入音频级发音引擎，因此不根据文字猜测发音。",
    },
    strengths: [
      "回答直接回应了题目",
      uniqueRatio > 0.65 ? "词汇重复较少" : "核心意思表达清楚",
    ],
    improvements: [
      {
        title: shortAnswer ? "把观点展开一层" : "让例子更具体",
        evidence: words.slice(0, 16).join(" ") || "当前回答",
        suggestion: "使用“观点 → 原因 → 例子 → 感受”的四步结构。",
      },
      {
        title: fillers > 1 ? "减少填充词" : "增加自然衔接",
        evidence: fillers > 1 ? `检测到约 ${fillers} 个常见填充词。` : "句子之间的连接还可以更自然。",
        suggestion: fillers > 1 ? "想词时短暂停顿，不要连续使用 um / like。" : "尝试使用 for example、as a result 或 what I mean is。",
      },
    ],
    improvedAnswer,
    nextFocus: shortAnswer ? "下一次至少给出一个真实例子。" : "下一次重点减少重复表达。",
    source: "demo",
    notice,
  };
}

export function extractJson(text: string) {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = withoutThinking.indexOf("{");
  const end = withoutThinking.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("MiniMax did not return a JSON object.");
  }
  return JSON.parse(withoutThinking.slice(start, end + 1));
}
