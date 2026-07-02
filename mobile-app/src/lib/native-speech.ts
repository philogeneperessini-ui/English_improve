import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export type NativeSpeechController = {
  stop: () => Promise<void>;
};

type NativeSpeechOptions = {
  continuous?: boolean;
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  onError?: (message: string) => void;
};

export async function startNativeSpeech(
  options: NativeSpeechOptions,
): Promise<NativeSpeechController | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const availability = await SpeechRecognition.available();
  if (!availability.available) {
    throw new Error("当前安卓设备没有可用的系统语音识别服务。");
  }

  let permission = await SpeechRecognition.checkPermissions();
  if (permission.speechRecognition !== "granted") {
    permission = await SpeechRecognition.requestPermissions();
  }
  if (permission.speechRecognition !== "granted") {
    throw new Error("请允许 SpeakMate 使用麦克风。");
  }

  let active = true;
  let latestText = "";
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const commitLatest = () => {
    const text = latestText.trim();
    latestText = "";
    options.onInterim("");
    if (text) options.onFinal(text);
  };

  const beginListening = async () => {
    if (!active) return;
    try {
      await SpeechRecognition.start({
        language: "en-US",
        maxResults: 1,
        partialResults: true,
        popup: false,
        prompt: "Speak English",
      });
    } catch (cause) {
      if (!active) return;
      options.onListeningChange?.(false);
      options.onError?.(cause instanceof Error ? cause.message : "语音识别启动失败。");
    }
  };

  const partialHandle = await SpeechRecognition.addListener("partialResults", ({ matches }) => {
    latestText = matches[0] || "";
    options.onInterim(latestText);
  });
  const stateHandle = await SpeechRecognition.addListener("listeningState", ({ status }) => {
    if (status === "started") {
      options.onListeningChange?.(true);
      return;
    }

    commitLatest();
    if (active && options.continuous) {
      restartTimer = setTimeout(() => void beginListening(), 250);
    } else {
      options.onListeningChange?.(false);
    }
  });

  await beginListening();

  return {
    stop: async () => {
      if (!active) return;
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      commitLatest();
      await SpeechRecognition.stop().catch(() => undefined);
      await partialHandle.remove();
      await stateHandle.remove();
      options.onListeningChange?.(false);
    },
  };
}
