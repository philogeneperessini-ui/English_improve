export type IeltsPart = 1 | 2 | 3;

export type Question = {
  id: string;
  part: IeltsPart;
  topic: string;
  prompt: string;
  cuePoints?: string[];
  prepSeconds: number;
  answerSeconds: number;
};

export type ScoreKey = "fluency" | "vocabulary" | "grammar" | "relevance";

export type Improvement = {
  title: string;
  evidence: string;
  suggestion: string;
};

export type Evaluation = {
  overall: number;
  summary: string;
  scores: Record<ScoreKey, number>;
  pronunciation: {
    score: number | null;
    note: string;
  };
  strengths: string[];
  improvements: Improvement[];
  improvedAnswer: string;
  nextFocus: string;
  source: "demo" | "minimax";
  notice?: string;
};

export type SpeechMetrics = {
  wordCount: number;
  wordsPerMinute: number;
  lexicalDiversity: number;
  fillerCount: number;
  repetitionCount: number;
  pauseCount: number;
  averagePauseMs: number;
  longestPauseMs: number;
};

export type PracticeRecord = {
  id: string;
  createdAt: string;
  durationSeconds: number;
  question: Question;
  transcript: string;
  evaluation: Evaluation;
  metrics?: SpeechMetrics;
  audio?: Blob;
};
