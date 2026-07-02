import type { SpeechMetrics } from "@/lib/types";

const singleFillers = new Set(["um", "uh", "erm", "basically"]);
const fillerPhrases = [/\byou know\b/gi, /\bi mean\b/gi, /\bsort of\b/gi, /\bkind of\b/gi];

export function analyzeSpeech(
  transcript: string,
  durationSeconds: number,
  pauseDurationsMs: number[] = [],
): SpeechMetrics {
  const words = transcript.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  const normalized = words.map((word) => word.toLowerCase());
  const wordCount = words.length;
  const meaningfulDuration = Math.max(durationSeconds, 1);
  const wordsPerMinute = Math.round((wordCount / meaningfulDuration) * 60);
  const lexicalDiversity = wordCount
    ? Math.round((new Set(normalized).size / wordCount) * 100) / 100
    : 0;

  const singleFillerCount = normalized.filter((word) => singleFillers.has(word)).length;
  const phraseFillerCount = fillerPhrases.reduce(
    (total, pattern) => total + (transcript.match(pattern)?.length ?? 0),
    0,
  );

  let repetitionCount = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) repetitionCount += 1;
  }

  const meaningfulPauses = pauseDurationsMs.filter((pause) => pause >= 700);
  const averagePauseMs = meaningfulPauses.length
    ? Math.round(meaningfulPauses.reduce((sum, pause) => sum + pause, 0) / meaningfulPauses.length)
    : 0;

  return {
    wordCount,
    wordsPerMinute,
    lexicalDiversity,
    fillerCount: singleFillerCount + phraseFillerCount,
    repetitionCount,
    pauseCount: meaningfulPauses.length,
    averagePauseMs,
    longestPauseMs: meaningfulPauses.length ? Math.max(...meaningfulPauses) : 0,
  };
}
