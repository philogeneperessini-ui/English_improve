"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  History,
  Home,
  LoaderCircle,
  MessageCircle,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationScreen } from "@/components/conversation-screen";
import { AuthLogoutButton } from "@/components/auth-gate";
import { getDailyQuestion, partTips, questions } from "@/lib/questions";
import { analyzeSpeech } from "@/lib/metrics";
import { speakEnglishText } from "@/lib/client-tts";
import { startNativeSpeech, type NativeSpeechController } from "@/lib/native-speech";
import { deletePractice, listConversations, listPractices, savePractice } from "@/lib/storage";
import { useRecorder } from "@/lib/use-recorder";
import type { Evaluation, PracticeRecord, Question, ScoreKey, SpeechMetrics } from "@/lib/types";

type Tab = "home" | "practice" | "conversation" | "history";
type PracticeStage = "question" | "ai-coach" | "recording" | "review" | "loading" | "result";

const scoreLabels: Record<ScoreKey, string> = {
  fluency: "流利度",
  vocabulary: "词汇",
  grammar: "语法",
  relevance: "切题度",
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function SpeakingApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [stage, setStage] = useState<PracticeStage>("question");
  const [selectedQuestion, setSelectedQuestion] = useState<Question>(getDailyQuestion());
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<PracticeRecord | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const [providerReady, setProviderReady] = useState(false);

  const refreshRecords = useCallback(async () => {
    setRecords(await listPractices());
  }, []);

  useEffect(() => {
    listPractices()
      .then((items) => setRecords(items))
      .catch(() => undefined);
    fetch("/api/status")
      .then((response) => response.json())
      .then((status) => setProviderReady(Boolean(status.minimaxConfigured)))
      .catch(() => undefined);
  }, [refreshRecords]);

  // 进入对话页时，若没有指定对话，自动加载最近一条（若有）
  useEffect(() => {
    if (tab !== "conversation" || activeConversationId !== undefined) return;
    listConversations()
      .then((items) => {
        if (items.length > 0) setActiveConversationId(items[0].id);
      })
      .catch(() => undefined);
  }, [tab, activeConversationId]);

  const beginPractice = (question: Question) => {
    setSelectedQuestion(question);
    setActiveRecord(null);
    setStage("question");
    setTab("practice");
  };

  const openRecord = (record: PracticeRecord) => {
    setSelectedQuestion(record.question);
    setActiveRecord(record);
    setStage("result");
    setTab("practice");
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[760px] pb-24 md:px-5 md:pb-8">
      <header className="safe-top flex items-center justify-between px-5 pb-4 md:px-2">
        <button
          type="button"
          onClick={() => setTab("home")}
          className="flex items-center gap-2 text-left"
          aria-label="返回首页"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-[var(--green)] text-sm font-black text-white shadow-sm">
            S
          </span>
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Daily speaking</span>
            <span className="block text-lg font-bold tracking-tight">SpeakMate</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${providerReady ? "bg-[var(--mint)] text-[var(--green)]" : "bg-white text-[var(--muted)]"}`}>
            <span className={`mr-1.5 inline-block size-2 rounded-full ${providerReady ? "bg-emerald-600" : "bg-amber-400"}`} />
            {providerReady ? "MiniMax 已连接" : "演示模式"}
          </div>
          <AuthLogoutButton />
        </div>
      </header>

      <main className="px-4 md:px-0">
        {tab === "home" && (
          <HomeScreen
            records={records}
            dailyQuestion={getDailyQuestion()}
            onStart={beginPractice}
            onBrowse={() => {
              setStage("question");
              setTab("practice");
            }}
            onConversation={() => setTab("conversation")}
          />
        )}
        {tab === "practice" && (
          <PracticeScreen
            question={selectedQuestion}
            stage={stage}
            record={activeRecord}
            onStageChange={setStage}
            onQuestionChange={setSelectedQuestion}
            onSaved={async (record) => {
              setActiveRecord(record);
              await refreshRecords();
            }}
            onClose={() => setTab("home")}
          />
        )}
        {tab === "history" && (
          <HistoryScreen
            records={records}
            onOpen={openRecord}
            onDelete={async (id) => {
              await deletePractice(id);
              await refreshRecords();
            }}
          />
        )}
        {tab === "conversation" && (
          <ConversationScreen
            conversationId={activeConversationId}
            onConversationChange={(id) => setActiveConversationId(id || undefined)}
            onClose={() => setTab("home")}
          />
        )}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[760px] border-t border-black/5 bg-[rgba(255,254,250,0.92)] px-6 pt-2 backdrop-blur-xl md:sticky md:mt-5 md:rounded-3xl md:border">
        <div className="grid grid-cols-4">
          <NavButton active={tab === "home"} icon={<Home size={20} />} label="首页" onClick={() => setTab("home")} />
          <NavButton active={tab === "practice"} icon={<Mic size={20} />} label="练习" onClick={() => setTab("practice")} />
          <NavButton active={tab === "conversation"} icon={<MessageCircle size={20} />} label="对话" onClick={() => setTab("conversation")} />
          <NavButton active={tab === "history"} icon={<History size={20} />} label="记录" onClick={() => setTab("history")} />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition ${active ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
      <span className={active ? "rounded-xl bg-[var(--mint)] px-5 py-1" : "px-5 py-1"}>{icon}</span>
      {label}
    </button>
  );
}

function HomeScreen({ records, dailyQuestion, onStart, onBrowse, onConversation }: { records: PracticeRecord[]; dailyQuestion: Question; onStart: (question: Question) => void; onBrowse: () => void; onConversation: () => void }) {
  const average = records.length
    ? records.slice(0, 5).reduce((sum, record) => sum + record.evaluation.overall, 0) / Math.min(records.length, 5)
    : 0;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[30px] bg-[var(--green)] p-6 text-white shadow-[0_18px_50px_rgba(23,63,56,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Today&apos;s practice</p>
            <h1 className="max-w-[15rem] text-3xl font-semibold leading-[1.1] tracking-[-0.04em]">Say it better,<br />one answer at a time.</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold">
            <Flame size={16} className="text-[var(--coral)]" fill="currentColor" /> {records.length}
          </div>
        </div>
        <div className="mt-8 rounded-3xl bg-white/[0.08] p-4 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between text-xs text-white/55">
            <span>IELTS PART {dailyQuestion.part}</span>
            <span>{dailyQuestion.answerSeconds} sec</span>
          </div>
          <p className="text-lg font-medium leading-snug">{dailyQuestion.prompt}</p>
          <button type="button" onClick={() => onStart(dailyQuestion)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] px-5 py-3.5 text-sm font-bold text-[var(--ink)] transition active:scale-[0.98]">
            Start today&apos;s answer <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <button type="button" onClick={onConversation} className="flex w-full items-center gap-4 rounded-[26px] bg-[#f8d5cc] p-4 text-left transition active:scale-[0.99]">
        <span className="grid size-12 shrink-0 place-items-center rounded-[18px] bg-[var(--coral)] text-white"><MessageCircle size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#9d4936]">New · Free conversation</span>
          <span className="mt-1 block text-lg font-bold">和 AI 自由聊几分钟</span>
          <span className="block text-sm text-[var(--muted)]">日常、旅行、职场或观点讨论</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-[#9d4936]" />
      </button>

      <section className="grid grid-cols-2 gap-3">
        <StatCard icon={<BarChart3 size={18} />} label="最近均分" value={records.length ? average.toFixed(1) : "—"} detail="最近 5 次" />
        <StatCard icon={<Clock3 size={18} />} label="练习次数" value={String(records.length)} detail="仅保存在本机" />
      </section>

      <section className="rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">Quick practice</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">选择练习方式</h2>
          </div>
          <button type="button" onClick={onBrowse} className="rounded-full bg-[var(--paper)] p-2 text-[var(--muted)]"><ChevronRight size={20} /></button>
        </div>
        <div className="space-y-2.5">
          {[1, 2, 3].map((part) => {
            const question = questions.find((item) => item.part === part)!;
            const descriptions = ["轻松热身 · 45 秒", "完整陈述 · 2 分钟", "深入讨论 · 90 秒"];
            return (
              <button key={part} type="button" onClick={() => onStart(question)} className="flex w-full items-center gap-3 rounded-2xl bg-[var(--paper)] p-3.5 text-left transition active:scale-[0.99]">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-black ${part === 1 ? "bg-[var(--mint)]" : part === 2 ? "bg-[var(--lime)]" : "bg-[#f8d5cc]"}`}>P{part}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">Part {part}</span>
                  <span className="block text-sm text-[var(--muted)]">{descriptions[part - 1]}</span>
                </span>
                <ChevronRight size={18} className="text-[var(--muted)]" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="mb-5 flex size-9 items-center justify-center rounded-xl bg-[var(--mint)] text-[var(--green)]">{icon}</div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function PracticeScreen({ question, stage, record, onStageChange, onQuestionChange, onSaved, onClose }: { question: Question; stage: PracticeStage; record: PracticeRecord | null; onStageChange: (stage: PracticeStage) => void; onQuestionChange: (question: Question) => void; onSaved: (record: PracticeRecord) => Promise<void>; onClose: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [pauseDurations, setPauseDurations] = useState<number[]>([]);
  const [referenceAnswer, setReferenceAnswer] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const metrics = useMemo(
    () => analyzeSpeech(transcript, duration, pauseDurations),
    [duration, pauseDurations, transcript],
  );

  const reset = () => {
    setTranscript("");
    setAudio(null);
    setDuration(0);
    setPauseDurations([]);
    setReferenceAnswer(undefined);
    setError("");
    onStageChange("question");
  };

  const evaluate = async () => {
    if (transcript.trim().length < 3) {
      setError("请先补充几句转写文本再提交。若浏览器未自动转写，可以手动输入。 ");
      return;
    }
    setError("");
    onStageChange("loading");
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, question, durationSeconds: duration, metrics }),
      });
      if (!response.ok) throw new Error("评价请求失败，请稍后重试。");
      const evaluation = (await response.json()) as Evaluation;
      const practiceRecord: PracticeRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        durationSeconds: duration,
        question,
        transcript,
        evaluation,
        metrics,
        audio: audio || undefined,
        referenceAnswer,
      };
      await savePractice(practiceRecord);
      await onSaved(practiceRecord);
      onStageChange("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评价失败，请稍后重试。");
      onStageChange("review");
    }
  };

  if (stage === "result" && record) {
    return <ResultScreen record={record} onRetry={reset} onClose={onClose} />;
  }

  if (stage === "loading") {
    return (
      <section className="grid min-h-[65dvh] place-items-center rounded-[30px] bg-[var(--card)] p-8 text-center">
        <div>
          <span className="mx-auto mb-6 grid size-20 place-items-center rounded-[28px] bg-[var(--mint)] text-[var(--green)]"><LoaderCircle size={34} className="animate-spin" /></span>
          <h2 className="text-2xl font-bold">正在整理反馈</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">分析表达结构、语法与词汇。我们不会仅凭文字猜测你的发音。</p>
        </div>
      </section>
    );
  }

  if (stage === "ai-coach") {
    return (
      <CoachScreen
        question={question}
        referenceAnswer={referenceAnswer}
        onCancel={() => onStageChange("question")}
        onUseDraft={(draft) => {
          setReferenceAnswer(draft);
          onStageChange("recording");
        }}
      />
    );
  }

  if (stage === "recording") {
    return (
      <RecorderScreen
        question={question}
        referenceAnswer={referenceAnswer}
        onCancel={() => onStageChange(referenceAnswer ? "ai-coach" : "question")}
        onComplete={({ transcript: value, audio: blob, durationSeconds, pauseDurationsMs }) => {
          setTranscript(value);
          setAudio(blob);
          setDuration(durationSeconds);
          setPauseDurations(pauseDurationsMs);
          onStageChange("review");
        }}
      />
    );
  }

  if (stage === "review") {
    return (
      <section className="space-y-4">
        <div className="rounded-[28px] bg-[var(--green)] p-5 text-white">
          <div className="flex items-center justify-between text-xs text-white/55"><span>PART {question.part} · {question.topic}</span><span>{formatDuration(duration)}</span></div>
          <p className="mt-3 text-xl font-medium leading-snug">{question.prompt}</p>
        </div>
        {audio && <AudioPlayer blob={audio} />}
        <SpeechMetricStrip metrics={metrics} />
        <div className="rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">Transcript</p><h2 className="text-xl font-bold">检查转写</h2></div>
            <span className="rounded-full bg-[var(--paper)] px-3 py-1 text-xs text-[var(--muted)]">可编辑</span>
          </div>
          <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="浏览器没有自动转写时，可以在这里手动输入你的回答……" className="min-h-52 w-full resize-none rounded-2xl bg-[var(--paper)] p-4 text-[16px] leading-7 outline-none ring-[var(--mint)] focus:ring-2" />
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">自动转写依赖手机浏览器支持。请只修正明显的识别错误，保留你原本的语法与重复。</p>
        </div>
        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <button type="button" onClick={reset} className="rounded-2xl border border-[var(--line)] bg-white p-4"><RefreshCw size={20} /></button>
          <button type="button" onClick={evaluate} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--green)] p-4 font-bold text-white"><WandSparkles size={18} /> 获取反馈</button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white"><ArrowLeft size={20} /></button>
        <p className="text-sm font-semibold text-[var(--muted)]">选择题目</p>
        <div className="size-10" />
      </div>
      <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3].map((part) => (
          <button key={part} type="button" onClick={() => onQuestionChange(questions.find((item) => item.part === part)!)} className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold ${question.part === part ? "bg-[var(--green)] text-white" : "bg-white text-[var(--muted)]"}`}>Part {part}</button>
        ))}
      </div>
      <QuestionCard question={question} onStart={(mode) => onStageChange(mode === "coach" ? "ai-coach" : "recording")} />
      <div className="rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">More questions</p>
        <div className="space-y-2">
          {questions.filter((item) => item.part === question.part && item.id !== question.id).map((item) => (
            <button key={item.id} type="button" onClick={() => onQuestionChange(item)} className="flex w-full items-center gap-3 rounded-2xl bg-[var(--paper)] p-3 text-left">
              <BookOpen size={17} className="shrink-0 text-[var(--green)]" />
              <span className="flex-1 text-sm font-medium leading-snug">{item.prompt}</span>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuestionCard({ question, onStart }: { question: Question; onStart: (mode: "direct" | "coach") => void }) {
  return (
    <div className="overflow-hidden rounded-[30px] bg-[var(--green)] text-white shadow-[0_18px_50px_rgba(23,63,56,0.15)]">
      <div className="p-6">
        <div className="mb-10 flex items-center justify-between">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">{question.topic}</span>
          <span className="text-xs text-white/55">{question.prepSeconds ? `${question.prepSeconds}s prep` : "No prep"}</span>
        </div>
        <p className="text-2xl font-semibold leading-snug tracking-tight">{question.prompt}</p>
        {question.cuePoints && (
          <ul className="mt-5 space-y-2 text-sm text-white/70">
            {question.cuePoints.map((point) => <li key={point} className="flex gap-2"><span className="text-[var(--lime)]">•</span>{point}</li>)}
          </ul>
        )}
        <div className="mt-5 rounded-2xl bg-black/10 p-3 text-xs leading-relaxed text-white/65">
          <span className="font-bold text-[var(--lime)]">本题提示：</span> {partTips[question.part][0]}
        </div>
      </div>
      <div className="space-y-2 bg-white/[0.07] px-6 py-4">
        <div><p className="text-xs text-white/50">Answer time · up to {question.answerSeconds} sec</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onStart("direct")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] px-5 py-3 font-bold text-[var(--ink)]"><Mic size={18} /> 直接回答</button>
          <button type="button" onClick={() => onStart("coach")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white ring-1 ring-white/20"><WandSparkles size={18} /> AI 辅助构思</button>
        </div>
        <p className="text-center text-[11px] text-white/40">直接回答 · 或先让 AI 帮你把想法整理成英文范文再练</p>
      </div>
    </div>
  );
}

type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  draft?: string;
  source?: "demo" | "minimax";
};

function CoachScreen({ question, referenceAnswer, onCancel, onUseDraft }: { question: Question; referenceAnswer?: string; onCancel: () => void; onUseDraft: (draft: string) => void }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState<string>(referenceAnswer ?? "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const speakEnglish = (text: string) => {
    void speakEnglishText(text);
  };

  const sendIdea = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError("");
    const userMessage: CoachMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: { part: question.part, topic: question.topic, prompt: question.prompt },
          messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      if (!response.ok) throw new Error("请求失败，请稍后重试。");
      const result = (await response.json()) as { reply: string; draft: string; source: string; error?: string };
      const assistantMessage: CoachMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        draft: result.draft,
        source: result.source as "demo" | "minimax",
      };
      setMessages((current) => [...current, assistantMessage]);
      if (result.draft) setDraft(result.draft);
      if (result.error) setError(result.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 辅助请求失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex min-h-[72dvh] flex-col rounded-[30px] bg-[var(--card)]">
      <div className="rounded-t-[30px] bg-[var(--green)] p-5 text-white">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onCancel} className="grid size-10 place-items-center rounded-full bg-white/10"><X size={20} /></button>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">AI 辅助构思 · PART {question.part}</span>
          <span className="w-10" />
        </div>
        <p className="mt-4 text-lg font-medium leading-snug">{question.prompt}</p>
      </div>

      <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-[var(--paper)] p-4 text-sm leading-relaxed text-[var(--muted)]">
            <p className="mb-1 font-bold text-[var(--ink)]">用中文说说你想怎么回答</p>
            <p>例如：「我想说我住在上海，最喜欢这里的生活便利，周末会去博物馆。」AI 会帮你整理成地道英文范文。可以多轮补充修改。</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-4"}>
            {message.role === "user" ? (
              <div className="rounded-[22px] rounded-br-md bg-[var(--green)] px-4 py-3 text-[15px] leading-6 text-white">{message.content}</div>
            ) : (
              <div className="space-y-2">
                <p className="px-1 text-sm text-[var(--muted)]">{message.content}{message.source && <span className="ml-1 text-[10px]">· {message.source === "minimax" ? "MiniMax" : "Demo"}</span>}</p>
                {message.draft && (
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--green)]">英文范文</span>
                      <button type="button" onClick={() => speakEnglish(message.draft!)} className="flex items-center gap-1 text-[11px] text-[var(--muted)]"><Volume2 size={12} /> 朗读</button>
                    </div>
                    <p className="text-[15px] leading-7 text-[var(--ink)]">{message.draft}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="mr-4 flex w-fit items-center gap-2 rounded-[22px] rounded-bl-md bg-[var(--paper)] px-4 py-3 text-[var(--muted)]">
            <LoaderCircle size={16} className="animate-spin" /> 正在整理范文…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mx-4 mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {draft && (
        <div className="border-t border-[var(--line)] p-3">
          <div className="mb-2 rounded-2xl bg-[var(--paper)] p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--green)]">当前范文</span>
              <button type="button" onClick={() => speakEnglish(draft)} className="flex items-center gap-1 text-[11px] text-[var(--muted)]"><Volume2 size={12} /> 朗读</button>
            </div>
            <p className="line-clamp-3 text-sm leading-6 text-[var(--ink)]">{draft}</p>
          </div>
          <button type="button" onClick={() => onUseDraft(draft)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--green)] p-3.5 font-bold text-white"><Mic size={18} /> 就用这个范文去练习</button>
        </div>
      )}

      <div className="border-t border-[var(--line)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendIdea();
              }
            }}
            placeholder="用中文说说你的想法，或补充要修改的点…"
            rows={2}
            className="max-h-28 min-h-[3.5rem] flex-1 resize-none rounded-2xl bg-[var(--paper)] px-4 py-3 text-[15px] outline-none ring-[var(--mint)] focus:ring-2"
          />
          <button type="button" onClick={sendIdea} disabled={sending || !input.trim()} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--green)] text-white disabled:opacity-35" aria-label="发送">
            {sending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}

function RecorderScreen({ question, referenceAnswer, onCancel, onComplete }: { question: Question; referenceAnswer?: string; onCancel: () => void; onComplete: (result: { transcript: string; audio: Blob; durationSeconds: number; pauseDurationsMs: number[] }) => void }) {
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const nativeRecognitionRef = useRef<NativeSpeechController | null>(null);
  const finalTranscriptRef = useRef("");
  const pauseDurationsRef = useRef<number[]>([]);
  const completedRef = useRef(false);
  const recorder = useRecorder();

  const cleanupRecognition = useCallback(() => {
    void nativeRecognitionRef.current?.stop();
    nativeRecognitionRef.current = null;
  }, []);

  const speakEnglish = (text: string) => {
    void speakEnglishText(text);
  };

  useEffect(() => {
    return () => {
      cleanupRecognition();
      recorder.reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 上传音频到服务端转写（ASR 兜底路径）。国内浏览器的主要转写方式。
  const transcribeAudio = async (audio: Blob): Promise<string> => {
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    const response = await fetch("/api/transcribe", { method: "POST", body: form });
    const result = (await response.json()) as { text?: string; error?: string };
    if (!response.ok && !result.text) {
      throw new Error(result.error || `语音转写失败（HTTP ${response.status}）。`);
    }
    return (result.text || "").trim();
  };

  const finish = async (audio: Blob, durationSeconds: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    cleanupRecognition();
    const realtimeTranscript = `${finalTranscriptRef.current}${interimTranscript}`.trim();
    // 实时识别已经拿到文字 → 直接用，不必再上传（省一次请求、更省隐私）
    if (realtimeTranscript.length >= 3) {
      onComplete({ transcript: realtimeTranscript, audio, durationSeconds, pauseDurationsMs: pauseDurationsRef.current });
      return;
    }
    // 没有实时文字 → 上传服务端 ASR 转写
    setTranscribing(true);
    setError("");
    try {
      const text = await transcribeAudio(audio);
      onComplete({
        transcript: text,
        audio,
        durationSeconds,
        pauseDurationsMs: pauseDurationsRef.current,
      });
    } catch (cause) {
      // ASR 失败：仍然进入 review，transcript 为空，用户可在下一步手动输入
      setTranscribing(false);
      completedRef.current = false;
      setError(cause instanceof Error ? cause.message + " 可在下一步手动输入文字。" : "语音转写失败，可在下一步手动输入文字。");
    }
  };

  const startRecording = async () => {
    setError("");
    setInterimTranscript("");
    setFinalTranscript("");
    finalTranscriptRef.current = "";
    pauseDurationsRef.current = [];
    completedRef.current = false;

    const ok = await recorder.start();
    if (!ok) {
      setError(recorder.error || "无法访问麦克风。请在浏览器设置中允许麦克风权限。");
      return;
    }

    // 仅在 APK 内尝试原生识别做实时转写（省服务端 ASR 额度、体验更实时）。
    // 浏览器不再使用 webkitSpeechRecognition——它在手机/国内 Chrome 上经常静默失败，
    // 既不出文字也不报错；浏览器统一在停止录音后走服务端 ASR 转写。
    if (typeof window !== "undefined" && "Capacitor" in window) {
      try {
        const nativeRecognition = await startNativeSpeech({
          continuous: true,
          onFinal: (text) => {
            finalTranscriptRef.current += `${text.trim()} `;
            setFinalTranscript(finalTranscriptRef.current);
          },
          onInterim: setInterimTranscript,
          onError: setError,
        });
        if (nativeRecognition) {
          nativeRecognitionRef.current = nativeRecognition;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "语音转写暂时不可用，可在下一步手动修改文字。");
      }
    }
    // 停止录音时，若没有实时文字，会自动上传服务端 ASR 转写（见 finish）。
  };

  const stopRecording = async () => {
    if (transcribing || completedRef.current) return;
    cleanupRecognition();
    const result = await recorder.stop();
    if (!result) {
      setError("录音失败，请重试。");
      return;
    }
    await finish(result.audio, result.durationSeconds);
  };

  return (
    <section className="flex min-h-[72dvh] flex-col rounded-[30px] bg-[var(--green)] p-5 text-white">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => { cleanupRecognition(); recorder.reset(); onCancel(); }} className="grid size-10 place-items-center rounded-full bg-white/10"><X size={20} /></button>
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">IELTS PART {question.part}</span>
        <span className="w-10 text-right font-mono text-sm">{formatDuration(recorder.seconds)}</span>
      </div>
      <div className="mt-8 rounded-3xl bg-white/[0.07] p-5 ring-1 ring-white/10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Question</p>
        <p className="text-xl font-medium leading-snug">{question.prompt}</p>
      </div>
      {referenceAnswer && (
        <div className="mt-3 rounded-3xl bg-white/[0.12] p-5 ring-1 ring-[var(--lime)]/30">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lime)]">参考范文 · 照着说</p>
            <button type="button" onClick={() => speakEnglish(referenceAnswer)} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px]"><Volume2 size={12} /> 朗读</button>
          </div>
          <p className="text-sm leading-relaxed text-white/85">{referenceAnswer}</p>
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <div className="relative">
          <button type="button" onClick={recorder.recording ? stopRecording : startRecording} disabled={transcribing} className={`relative z-10 grid size-24 place-items-center rounded-full transition active:scale-95 disabled:opacity-60 ${recorder.recording ? "recording-ring bg-[var(--coral)]" : "bg-[var(--lime)] text-[var(--ink)]"}`} aria-label={recorder.recording ? "停止录音" : "开始录音"}>
            {transcribing ? <LoaderCircle size={30} className="animate-spin" /> : recorder.recording ? <Square size={30} fill="currentColor" /> : <Mic size={34} />}
          </button>
        </div>
        <p className="mt-7 text-lg font-bold">{transcribing ? "正在把语音转成文字…" : recorder.recording ? "正在聆听…" : "准备好后点击麦克风"}</p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/50">{transcribing ? "请稍候，识别完成后会自动进入下一步。" : recorder.recording ? "自然回答即可；想词时安静停顿，比连续使用填充词更好。" : "录音仅保存在当前设备，转写由服务端完成，只发送录音用于识别。"}</p>
        {(finalTranscript || interimTranscript) && <p className="mt-5 line-clamp-3 max-w-sm rounded-2xl bg-black/10 p-3 text-sm leading-relaxed text-white/65">{finalTranscript}<span className="text-white/35">{interimTranscript}</span></p>}
        {error && <p className="mt-5 rounded-2xl bg-red-400/15 p-3 text-sm text-red-100">{error}</p>}
      </div>
    </section>
  );
}

function AudioPlayer({ blob }: { blob: Blob }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--card)] p-3">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button type="button" onClick={toggle} className="grid size-11 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--green)]">{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      <div className="flex-1"><p className="text-sm font-bold">你的录音</p><p className="text-xs text-[var(--muted)]">点击回放检查声音</p></div>
      <Volume2 size={19} className="text-[var(--muted)]" />
    </div>
  );
}

function SpeechMetricStrip({ metrics }: { metrics: SpeechMetrics }) {
  const items = [
    { label: "词数", value: String(metrics.wordCount) },
    { label: "语速", value: `${metrics.wordsPerMinute} WPM` },
    { label: "填充词", value: String(metrics.fillerCount) },
    { label: "停顿", value: String(metrics.pauseCount) },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--card)] p-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 text-center">
          <p className="truncate text-sm font-bold">{item.value}</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function ResultScreen({ record, onRetry, onClose }: { record: PracticeRecord; onRetry: () => void; onClose: () => void }) {
  const { evaluation } = record;
  const speak = () => {
    void speakEnglishText(evaluation.improvedAnswer);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white"><ArrowLeft size={20} /></button>
        <p className="text-sm font-semibold text-[var(--muted)]">练习反馈</p>
        <button type="button" onClick={onRetry} className="grid size-10 place-items-center rounded-full bg-white"><RefreshCw size={18} /></button>
      </div>

      <div className="rounded-[30px] bg-[var(--green)] p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Estimated level</p><p className="mt-1 text-6xl font-semibold tracking-[-0.06em]">{evaluation.overall.toFixed(1)}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${evaluation.source === "minimax" ? "bg-[var(--lime)] text-[var(--ink)]" : "bg-white/10 text-white/70"}`}>{evaluation.source === "minimax" ? "MiniMax" : "Demo"}</span>
        </div>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">{evaluation.summary}</p>
        <div className="mt-6 grid grid-cols-4 gap-2">
          {(Object.entries(evaluation.scores) as [ScoreKey, number][]).map(([key, value]) => (
            <div key={key} className="rounded-2xl bg-white/[0.08] p-2.5 text-center"><p className="text-lg font-bold">{value.toFixed(1)}</p><p className="mt-0.5 text-[10px] text-white/45">{scoreLabels[key]}</p></div>
          ))}
        </div>
      </div>

      {evaluation.notice && <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{evaluation.notice}</p>}

      {record.metrics && <SpeechMetricStrip metrics={record.metrics} />}

      <div className="rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--green)]"><Check size={20} /></span><h2 className="text-xl font-bold">做得不错</h2></div>
        <ul className="space-y-3">
          {evaluation.strengths.map((strength) => <li key={strength} className="flex gap-3 text-sm leading-relaxed"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" />{strength}</li>)}
        </ul>
      </div>

      <div className="rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#f8d5cc] text-[#a53b24]"><Sparkles size={20} /></span><h2 className="text-xl font-bold">优先改善</h2></div>
        <div className="space-y-5">
          {evaluation.improvements.map((item, index) => (
            <div key={`${item.title}-${index}`} className="border-b border-[var(--line)] pb-5 last:border-0 last:pb-0">
              <p className="font-bold">{index + 1}. {item.title}</p>
              <p className="mt-2 rounded-xl bg-[var(--paper)] p-3 text-sm italic text-[var(--muted)]">“{item.evidence}”</p>
              <p className="mt-2 text-sm leading-relaxed">{item.suggestion}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[26px] bg-[var(--lime)] p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">A better version</p><h2 className="mt-1 text-xl font-bold">参考表达</h2></div><button type="button" onClick={speak} className="grid size-11 place-items-center rounded-2xl bg-[var(--green)] text-white"><Volume2 size={19} /></button></div>
        <p className="mt-4 text-[15px] leading-7">{evaluation.improvedAnswer}</p>
      </div>

      <div className="rounded-[24px] border border-dashed border-[var(--line)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">Pronunciation</p>
        <p className="mt-2 text-sm leading-relaxed">{evaluation.pronunciation.note}</p>
      </div>

      <button type="button" onClick={onRetry} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--green)] p-4 font-bold text-white"><RefreshCw size={18} /> 再答一次</button>
    </section>
  );
}

function HistoryScreen({ records, onOpen, onDelete }: { records: PracticeRecord[]; onOpen: (record: PracticeRecord) => void; onDelete: (id: string) => Promise<void> }) {
  const scoreAverages = useMemo(() => {
    if (!records.length) return null;
    const recent = records.slice(0, 10);
    const keys: ScoreKey[] = ["fluency", "vocabulary", "grammar", "relevance"];
    return Object.fromEntries(
      keys.map((key) => [
        key,
        recent.reduce((sum, record) => sum + record.evaluation.scores[key], 0) / recent.length,
      ]),
    ) as Record<ScoreKey, number>;
  }, [records]);

  const leastPracticedPart = useMemo(() => {
    if (!records.length) return null;
    const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    records.forEach((record) => { counts[record.question.part] += 1; });
    return ([1, 2, 3] as const).reduce((least, part) => counts[part] < counts[least] ? part : least, 1);
  }, [records]);

  return (
    <section className="space-y-4">
      <div className="px-1"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Your progress</p><h1 className="mt-1 text-3xl font-bold tracking-tight">练习记录</h1></div>
      {scoreAverages && (
        <div className="rounded-[26px] bg-[var(--green)] p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Recent pattern</p><h2 className="mt-1 text-xl font-bold">最近 10 次表现</h2></div>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs">建议练习 Part {leastPracticedPart}</span>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {(Object.entries(scoreAverages) as [ScoreKey, number][]).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-white/[0.08] p-2.5 text-center">
                <p className="text-lg font-bold">{value.toFixed(1)}</p>
                <p className="mt-1 text-[10px] text-white/45">{scoreLabels[key]}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {records.length === 0 ? (
        <div className="grid min-h-[55dvh] place-items-center rounded-[28px] border border-[var(--line)] bg-[var(--card)] p-8 text-center">
          <div><span className="mx-auto mb-5 grid size-16 place-items-center rounded-[24px] bg-[var(--mint)]"><History size={27} /></span><h2 className="text-xl font-bold">还没有练习记录</h2><p className="mt-2 text-sm text-[var(--muted)]">完成第一次回答后，录音与反馈会保存在这里。</p></div>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-4">
              <button type="button" onClick={() => onOpen(record)} className="flex w-full items-center gap-4 text-left">
                <span className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-[var(--mint)] text-xl font-black">{record.evaluation.overall.toFixed(1)}</span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[var(--muted)]">PART {record.question.part} · {formatDate(record.createdAt)}</span><span className="mt-1 line-clamp-2 block font-bold leading-snug">{record.question.prompt}</span></span>
                <ChevronRight size={18} className="shrink-0 text-[var(--muted)]" />
              </button>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]"><span>{formatDuration(record.durationSeconds)} · {record.evaluation.source === "minimax" ? "MiniMax" : "Demo"}</span><button type="button" onClick={() => onDelete(record.id)} className="flex items-center gap-1 rounded-full px-2 py-1 text-red-500"><Trash2 size={14} /> 删除</button></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
