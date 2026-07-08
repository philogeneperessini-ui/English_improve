"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 共享录音 hook：只负责"录一段完整音频"，不含识别。
 *
 * 识别由调用方决定：
 *  - 练习页：停止后上传 /api/transcribe 转写
 *  - 对话页：停止后上传 /api/transcribe，或优先用原生 / 浏览器识别
 *
 * 用 MediaRecorder 输出 webm/opus（浏览器普遍支持，硅基流动也接受）。
 * 这样不再依赖需要联网 Google 的 webkitSpeechRecognition，国内浏览器也能用。
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const recordingRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    setError("");
    setSeconds(0);
    secondsRef.current = 0;
    chunksRef.current = [];

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("当前环境不支持麦克风录音。");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(500);

      recordingRef.current = true;
      setRecording(true);
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
      return true;
    } catch {
      setError("无法访问麦克风，请在浏览器设置中允许麦克风权限。");
      stopTracks();
      clearTimer();
      setRecording(false);
      recordingRef.current = false;
      return false;
    }
  }, []);

  /**
   * 停止录音并返回这段音频。若尚未开始或已停止，返回 null。
   */
  const stop = useCallback((): Promise<{ audio: Blob; durationSeconds: number } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive" || !recordingRef.current) {
        resolve(null);
        return;
      }
      recordingRef.current = false;
      setRecording(false);
      clearTimer();

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const audio = new Blob(chunksRef.current, { type: mimeType });
        const durationSeconds = secondsRef.current;
        stopTracks();
        mediaRecorderRef.current = null;
        resolve(audio.size > 0 ? { audio, durationSeconds } : null);
      };
      recorder.stop();
    });
  }, []);

  const reset = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    clearTimer();
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;
    stopTracks();
    setSeconds(0);
    secondsRef.current = 0;
    chunksRef.current = [];
    setError("");
  }, []);

  // 组件卸载时确保释放麦克风
  useEffect(() => {
    return () => {
      recordingRef.current = false;
      clearTimer();
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      stopTracks();
    };
  }, []);

  return { recording, seconds, error, start, stop, reset, setError };
}
