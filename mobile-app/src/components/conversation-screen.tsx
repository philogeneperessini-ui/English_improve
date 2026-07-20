"use client";

import {
  ArrowLeft,
  History,
  LoaderCircle,
  MessageCircle,
  Mic,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { startNativeSpeech, type NativeSpeechController } from "@/lib/native-speech";
import { stopEnglishSpeech, speakEnglishText } from "@/lib/client-tts";
import { deleteConversation, getConversation, listConversations, saveConversation } from "@/lib/storage";
import { DEFAULT_TTS_PRESET_ID, getTtsPreset, ttsPresets, type TtsPresetId } from "@/lib/tts-presets";
import type { ChatMessage, ConversationRecord, ScenarioId } from "@/lib/types";
import { useRecorder } from "@/lib/use-recorder";

const scenarios: Array<{ id: ScenarioId; label: string; subtitle: string; greeting: string }> = [
  {
    id: "daily",
    label: "日常闲聊",
    subtitle: "轻松热身",
    greeting: "Hi! It's nice to talk with you. How has your day been so far?",
  },
  {
    id: "travel",
    label: "旅行英语",
    subtitle: "真实场景",
    greeting: "Welcome! Let's imagine you're planning a trip. Where would you like to go?",
  },
  {
    id: "work",
    label: "职场交流",
    subtitle: "清楚表达",
    greeting: "Hi! Let's talk about work. What kind of work or study are you doing at the moment?",
  },
  {
    id: "ideas",
    label: "观点讨论",
    subtitle: "深入表达",
    greeting: "Let's discuss an idea. Do you think technology gives people more free time?",
  },
];

function firstMessage(scenario: ScenarioId): ChatMessage {
  const selected = scenarios.find((item) => item.id === scenario)!;
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: selected.greeting,
  };
}

export function ConversationScreen({
  conversationId,
  onConversationChange,
  onClose,
}: {
  conversationId?: string;
  onConversationChange: (id: string) => void;
  onClose: () => void;
}) {
  const [scenario, setScenario] = useState<ScenarioId>("daily");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [firstMessage("daily")]);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [ttsPresetId, setTtsPresetId] = useState<TtsPresetId>(() => {
    if (typeof window === "undefined") return DEFAULT_TTS_PRESET_ID;
    const saved = window.localStorage.getItem("speakmate_tts_preset");
    return ttsPresets.find((item) => item.id === saved)?.id ?? DEFAULT_TTS_PRESET_ID;
  });
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConversationRecord[]>([]);
  const [recordId, setRecordId] = useState<string | undefined>(conversationId);
  const nativeRecognitionRef = useRef<NativeSpeechController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef("");
  const interimRef = useRef("");
  const conversationAbortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const speechSequenceRef = useRef(0);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const recorder = useRecorder();
  const selectedTtsPreset = getTtsPreset(ttsPresetId);

  const stopSpeaking = useCallback(() => {
    speechSequenceRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    stopEnglishSpeech();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    const speechId = ++speechSequenceRef.current;
    ttsAbortRef.current?.abort();
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    setSpeaking(true);
    void speakEnglishText(text, {
      signal: controller.signal,
      presetId: selectedTtsPreset.id,
      voice: selectedTtsPreset.voice,
      style: selectedTtsPreset.style,
      onStart: () => {
        if (speechId === speechSequenceRef.current) setSpeaking(true);
      },
      onEnd: () => {
        if (speechId === speechSequenceRef.current) setSpeaking(false);
        if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
      },
    });
  }, [selectedTtsPreset.id, selectedTtsPreset.style, selectedTtsPreset.voice]);

  const changeTtsPreset = (id: TtsPresetId) => {
    stopSpeaking();
    setTtsPresetId(id);
    window.localStorage.setItem("speakmate_tts_preset", id);
  };

  // 把指定消息列表落库到 IndexedDB，返回（可能的新）记录 id。
  // 不在 effect 里调用，避免链式渲染；只在对话有实质更新时（如收到 AI 回复）调用。
  const persistMessages = useCallback(
    async (currentMessages: ChatMessage[], currentScenario: ScenarioId, id?: string): Promise<string> => {
      if (currentMessages.length === 0) return id ?? "";
      const now = new Date().toISOString();
      const existing = id ? history.find((item) => item.id === id) : undefined;
      const recordId = id ?? crypto.randomUUID();
      const record: ConversationRecord = {
        id: recordId,
        scenario: currentScenario,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: currentMessages,
      };
      await saveConversation(record);
      if (!id) onConversationChange(recordId);
      setRecordId(recordId);
      return recordId;
    },
    [history, onConversationChange],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // 初始化：若有 conversationId 则恢复指定对话，否则新建
  useEffect(() => {
    if (!conversationId) return;
    void (async () => {
      const record = await getConversation(conversationId);
      if (record) {
        setScenario(record.scenario);
        setMessages(record.messages);
        setRecordId(record.id);
      }
    })();
  }, [conversationId]);

  useEffect(() => () => {
    void nativeRecognitionRef.current?.stop();
    conversationAbortRef.current?.abort();
    requestSequenceRef.current += 1;
    stopSpeaking();
    recorder.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = useCallback(async () => {
    const list = await listConversations();
    setHistory(list);
  }, []);

  const openHistory = async () => {
    await refreshHistory();
    setShowHistory(true);
  };

  const loadConversation = (id: string) => {
    const record = history.find((item) => item.id === id);
    if (record) {
      void nativeRecognitionRef.current?.stop();
      nativeRecognitionRef.current = null;
      conversationAbortRef.current?.abort();
      requestSequenceRef.current += 1;
      stopSpeaking();
      setSending(false);
      setListening(false);
      setTranscribing(false);
      recorder.reset();
      setScenario(record.scenario);
      setMessages(record.messages);
      setRecordId(record.id);
      onConversationChange(record.id);
      draftRef.current = "";
      interimRef.current = "";
      setDraft("");
      setInterim("");
      setError("");
      setShowHistory(false);
    }
  };

  const startNewConversation = (nextScenario: ScenarioId) => {
    void nativeRecognitionRef.current?.stop();
    nativeRecognitionRef.current = null;
    conversationAbortRef.current?.abort();
    requestSequenceRef.current += 1;
    stopSpeaking();
    setSending(false);
    setListening(false);
    recorder.reset();
    setScenario(nextScenario);
    setMessages([firstMessage(nextScenario)]);
    setRecordId(undefined);
    onConversationChange("");
    draftRef.current = "";
    interimRef.current = "";
    setDraft("");
    setInterim("");
    setError("");
    setTranscribing(false);
    setShowHistory(false);
  };

  const removeConversation = async (id: string) => {
    await deleteConversation(id);
    await refreshHistory();
  };

  const toggleAutoSpeak = () => {
    if (autoSpeak) stopSpeaking();
    setAutoSpeak((value) => !value);
  };

  // 切换场景：保留当前对话内容（用户可能想换话题继续），不强制清空。
  const changeScenario = (nextScenario: ScenarioId) => {
    if (nextScenario === scenario) return;
    setScenario(nextScenario);
  };

  // 把音频上传服务端转写。成功后直接进入发送环节，失败时仍可手动输入。
  const transcribeAndFill = async (audio: Blob): Promise<string> => {
    setTranscribing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", audio, "audio.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = (await response.json()) as { text?: string; error?: string };
      const text = (result.text || "").trim();
      if (text) {
        const next = `${draftRef.current} ${text}`.trim();
        draftRef.current = next;
        setDraft(next);
      } else {
        setError(result.error || `没有听清楚（HTTP ${response.status}），可以再试一次或直接打字。`);
      }
      return text;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "语音转写失败，可以再试一次或直接打字。");
      return "";
    } finally {
      setTranscribing(false);
    }
  };

  const toggleListening = async () => {
    // 正在录音/识别中 → 停止
    if (listening || recorder.recording) {
      // 浏览器实时识别
      // 原生识别
      if (nativeRecognitionRef.current) {
        await nativeRecognitionRef.current.stop();
        nativeRecognitionRef.current = null;
        const content = `${draftRef.current} ${interimRef.current}`.trim();
        interimRef.current = "";
        setInterim("");
        setListening(false);
        if (content) await sendMessage(content);
        return;
      }
      // MediaRecorder + 服务端 ASR 路径：停止录音后上传转写
      if (recorder.recording) {
        const result = await recorder.stop();
        if (result) {
          const transcript = await transcribeAndFill(result.audio);
          if (transcript && draftRef.current) await sendMessage(draftRef.current);
        }
      }
      setListening(false);
      return;
    }

    // 开口即打断：AI 还在生成或朗读时，立即取消旧轮次。
    conversationAbortRef.current?.abort();
    conversationAbortRef.current = null;
    requestSequenceRef.current += 1;
    stopSpeaking();
    setSending(false);
    setError("");
    interimRef.current = "";
    setInterim("");

    // APK 内优先用原生识别（体验最实时，不消耗服务端 ASR 额度）
    if (typeof window !== "undefined" && "Capacitor" in window) {
      setListening(true);
      try {
        const nativeRecognition = await startNativeSpeech({
          onFinal: (text) => {
            const next = `${draftRef.current} ${text}`.trim();
            draftRef.current = next;
            setDraft(next);
          },
          onInterim: (text) => {
            interimRef.current = text;
            setInterim(text);
          },
          onListeningChange: setListening,
          onError: setError,
        });
        if (nativeRecognition) {
          nativeRecognitionRef.current = nativeRecognition;
          return;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "语音识别启动失败。");
      }
      setListening(false);
    }

    // 浏览器主路径：MediaRecorder 录音 + 服务端 ASR 转写。
    // 不再默认用 webkitSpeechRecognition——它在手机/国内 Chrome 上经常静默失败，
    // 既不出文字也不报错，导致体验卡死。录音上传服务端转写更可靠。
    await startRecorder();
  };

  // 启动 MediaRecorder 录音；停止后再上传服务端转写。
  const startRecorder = async () => {
    const ok = await recorder.start();
    if (ok) setListening(true);
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? `${draftRef.current} ${interimRef.current}`).trim();
    if (!content || sending || transcribing) return;

    await nativeRecognitionRef.current?.stop();
    nativeRecognitionRef.current = null;
    if (recorder.recording) {
      const stopped = await recorder.stop();
      // 丢弃刚录的尾巴，不追加文字，避免影响发送
      void stopped;
    }
    setListening(false);
    draftRef.current = "";
    interimRef.current = "";
    setDraft("");
    setInterim("");
    setError("");
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setSending(true);
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    const requestId = ++requestSequenceRef.current;

    try {
      const response = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("对话请求失败，请稍后重试。 ");
      const result = await response.json();
      if (requestId !== requestSequenceRef.current) return;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        correction: result.correction,
        source: result.source,
      };
      const updatedMessages = [...nextMessages, assistantMessage];
      setMessages(updatedMessages);
      // 收到 AI 回复后落库（含用户消息 + AI 回复）
      void persistMessages(updatedMessages, scenario, recordId);
      if (autoSpeak) speak(result.reply);
      // 显示降级提示（如 MiniMax 失败的原因），便于诊断
      if (result.notice) setError(result.notice);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "对话请求失败，请稍后重试。 ");
    } finally {
      if (requestId === requestSequenceRef.current) setSending(false);
      if (conversationAbortRef.current === controller) {
        conversationAbortRef.current = null;
      }
    }
  };

  return (
    <section className="flex min-h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-[30px] border border-[var(--line)] bg-[var(--card)]">
      <div className="border-b border-[var(--line)] p-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-[var(--paper)]" aria-label="返回首页">
            <ArrowLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Free conversation</p>
            <h1 className="font-bold">AI 自由对话</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={openHistory} className="grid size-10 place-items-center rounded-full bg-[var(--paper)]" aria-label="历史对话">
              <History size={18} />
            </button>
            <button type="button" onClick={() => startNewConversation(scenario)} className="grid size-10 place-items-center rounded-full bg-[var(--paper)]" aria-label="开始新对话">
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {scenarios.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changeScenario(item.id)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-left ${scenario === item.id ? "bg-[var(--green)] text-white" : "bg-[var(--paper)]"}`}
            >
              <span className="block text-sm font-bold">{item.label}</span>
              <span className={`block text-[10px] ${scenario === item.id ? "text-white/55" : "text-[var(--muted)]"}`}>{item.subtitle}</span>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-[var(--muted)]">
            <Volume2 size={12} /> 语音风格
          </div>
          <div className="hide-scrollbar flex gap-2 overflow-x-auto">
            {ttsPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => changeTtsPreset(preset.id)}
                className={`shrink-0 rounded-2xl px-3 py-2 text-left ${ttsPresetId === preset.id ? "bg-[var(--ink)] text-white" : "bg-[var(--paper)]"}`}
              >
                <span className="block text-xs font-bold">{preset.label}</span>
                <span className={`block text-[10px] ${ttsPresetId === preset.id ? "text-white/55" : "text-[var(--muted)]"}`}>{preset.subtitle}</span>
              </button>
            ))}
          </div>
        </div>
        {showHistory && (
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-[var(--paper)] p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-bold text-[var(--muted)]">历史对话（{history.length}）</span>
              <button type="button" onClick={() => setShowHistory(false)} className="text-[var(--muted)]" aria-label="关闭历史">
                <X size={14} />
              </button>
            </div>
            {history.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-[var(--muted)]">还没有历史对话</p>
            )}
            {history.map((record) => {
              const scenarioMeta = scenarios.find((item) => item.id === record.scenario);
              const preview = record.messages.find((message) => message.role === "user")?.content
                || record.messages[0]?.content
                || "";
              return (
                <div key={record.id} className={`flex items-center gap-2 rounded-xl bg-white p-2 ${record.id === recordId ? "ring-2 ring-[var(--mint)]" : ""}`}>
                  <button type="button" onClick={() => loadConversation(record.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full bg-[var(--mint)] px-2 py-0.5 text-[10px] font-semibold text-[var(--green)]">{scenarioMeta?.label ?? record.scenario}</span>
                      <span className="truncate text-xs text-[var(--muted)]">{new Date(record.updatedAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 truncate text-sm">{preview}</p>
                  </button>
                  <button type="button" onClick={() => removeConversation(record.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:text-red-500" aria-label="删除对话">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs text-[var(--green)]">
          <MessageCircle size={13} /> 用英语自然交流，AI 会继续追问
        </div>
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-10" : "mr-8"}>
            <div className={`rounded-[22px] px-4 py-3 text-[15px] leading-6 ${message.role === "user" ? "rounded-br-md bg-[var(--green)] text-white" : "rounded-bl-md bg-[var(--paper)]"}`}>
              {message.content}
            </div>
            {message.role === "assistant" && (
              <div className="mt-1 flex items-center gap-2 px-2 text-[10px] text-[var(--muted)]">
                <button type="button" onClick={() => speak(message.content)} className="flex items-center gap-1"><Volume2 size={12} /> 朗读</button>
                {message.source && <span>· {message.source === "minimax" ? "MiniMax" : "Demo"}</span>}
              </div>
            )}
            {message.correction && (
              <div className="mt-2 rounded-2xl border border-[#efd8a8] bg-[#fff8e8] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-[#825b0a]"><Sparkles size={14} /> 更自然地说</p>
                <p className="mt-2 text-[var(--muted)] line-through">{message.correction.original}</p>
                <p className="mt-1 font-semibold text-[var(--green)]">{message.correction.improved}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{message.correction.tip}</p>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="mr-8 w-fit rounded-[22px] rounded-bl-md bg-[var(--paper)] px-4 py-3 text-[var(--muted)]">
            <LoaderCircle size={18} className="animate-spin" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--line)] bg-white p-3">
        {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {listening && (
          <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">正在听你说话，再按麦克风即可结束并自动发送</p>
        )}
        {transcribing && (
          <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-[var(--mint)] px-3 py-2 text-xs text-[var(--green)]">
            <LoaderCircle size={12} className="animate-spin" /> 正在把语音转成文字…
          </p>
        )}
        {speaking && (
          <p className="mb-2 rounded-xl bg-[var(--mint)] px-3 py-2 text-xs font-medium text-[var(--green)]">AI 正在说话，点麦克风可以随时打断</p>
        )}
        {interim && <p className="mb-2 rounded-xl bg-[var(--paper)] px-3 py-2 text-xs italic text-[var(--muted)]">{interim}</p>}
        <div className="flex items-end gap-2">
          <button type="button" onClick={toggleAutoSpeak} className={`grid size-11 shrink-0 place-items-center rounded-2xl ${autoSpeak ? "bg-[var(--mint)] text-[var(--green)]" : "bg-[var(--paper)] text-[var(--muted)]"}`} aria-label={autoSpeak ? "关闭自动朗读" : "开启自动朗读"}>
            {autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <textarea
            value={draft}
            onChange={(event) => {
              draftRef.current = event.target.value;
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder={listening || recorder.recording ? "Listening… 再按一下麦克风结束" : "Speak or type in English…"}
            rows={3}
            className="max-h-40 min-h-[5.5rem] flex-1 resize-none rounded-2xl bg-[var(--paper)] px-4 py-3 text-[15px] leading-6 outline-none ring-[var(--mint)] focus:ring-2"
          />
          <button type="button" onClick={toggleListening} disabled={transcribing} className={`grid size-11 shrink-0 place-items-center rounded-2xl disabled:opacity-50 ${listening || recorder.recording ? "recording-ring bg-[var(--coral)] text-white" : "bg-[var(--mint)] text-[var(--green)]"}`} aria-label={listening || recorder.recording ? "停止语音输入" : "开始语音输入"}>
            {listening || recorder.recording ? <Square size={17} fill="currentColor" /> : <Mic size={19} />}
          </button>
          <button type="button" onClick={() => void sendMessage()} disabled={sending || transcribing || (!draft.trim() && !interim.trim())} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--green)] text-white disabled:opacity-35" aria-label="发送消息">
            {sending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}
