type SpeakOptions = {
  presetId?: string;
  voice?: string;
  style?: string;
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onFallback?: (reason: string) => void;
};

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeController: AbortController | null = null;

function cleanupAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

function cleanupLocalAudio(audio: HTMLAudioElement | null, objectUrl: string | null) {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (activeAudio === audio) activeAudio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    if (activeObjectUrl === objectUrl) activeObjectUrl = null;
  }
}

export function stopEnglishSpeech() {
  activeController?.abort();
  activeController = null;
  cleanupAudio();
  window.speechSynthesis?.cancel();
}

function chooseEnglishVoice() {
  if (!("speechSynthesis" in window)) return null;
  const englishVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return englishVoices.find((voice) => /aria|jenny|samantha|google us english|natural/i.test(voice.name))
    ?? englishVoices.find((voice) => voice.localService)
    ?? englishVoices[0]
    ?? null;
}

function speakWithBrowser(text: string, options: SpeakOptions, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window) || signal.aborted) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const finish = () => {
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    utterance.lang = "en-US";
    utterance.voice = chooseEnglishVoice();
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    options.onStart?.();
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakEnglishText(text: string, options: SpeakOptions = {}) {
  if (typeof window === "undefined") return;
  stopEnglishSpeech();

  const controller = new AbortController();
  let localAudio: HTMLAudioElement | null = null;
  let localObjectUrl: string | null = null;
  activeController = controller;
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        presetId: options.presetId,
        voice: options.voice,
        style: options.style,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(detail?.error || `TTS HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (controller.signal.aborted) return;

    localObjectUrl = URL.createObjectURL(blob);
    localAudio = new Audio(localObjectUrl);
    activeObjectUrl = localObjectUrl;
    activeAudio = localAudio;

    await new Promise<void>((resolve, reject) => {
      if (!localAudio) {
        resolve();
        return;
      }
      localAudio.onended = () => resolve();
      localAudio.onerror = () => reject(new Error("音频播放失败。"));
      options.onStart?.();
      void localAudio.play().catch(reject);
    });
  } catch (cause) {
    if (controller.signal.aborted) return;
    const reason = cause instanceof Error ? cause.message : "云端 TTS 不可用。";
    options.onFallback?.(reason);
    await speakWithBrowser(text, options, controller.signal);
    return;
  } finally {
    options.signal?.removeEventListener("abort", abortFromCaller);
    if (activeController === controller) activeController = null;
    cleanupLocalAudio(localAudio, localObjectUrl);
    options.onEnd?.();
  }
}