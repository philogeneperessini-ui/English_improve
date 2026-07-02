"use client";

import { LockKeyhole, LoaderCircle, LogOut } from "lucide-react";
import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";

type SessionState = {
  configured: boolean;
  authEnabled: boolean;
  authenticated: boolean;
};

const AuthContext = createContext<{ authEnabled: boolean; logout: () => Promise<void> }>({
  authEnabled: false,
  logout: async () => undefined,
});

export function AuthLogoutButton() {
  const { authEnabled, logout } = useContext(AuthContext);
  if (!authEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="grid size-8 shrink-0 place-items-center rounded-full border border-black/5 bg-white text-[var(--muted)] shadow-sm"
      aria-label="退出登录"
      title="退出登录"
    >
      <LogOut size={15} />
    </button>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法检查登录状态。");
        return response.json();
      })
      .then(setSession)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法检查登录状态。"));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "登录失败。");
      setPassword("");
      setSession({ configured: true, authEnabled: payload.authEnabled, authenticated: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession((current) => current ? { ...current, authenticated: false } : current);
  };

  if (!session?.authenticated) {
    return (
      <main className="safe-top mx-auto grid min-h-dvh w-full max-w-[460px] place-items-center px-5 pb-8">
        <section className="w-full rounded-[32px] border border-[var(--line)] bg-[var(--card)] p-7 shadow-[0_24px_70px_rgba(23,63,56,0.12)]">
          <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-[var(--green)] text-white">
            {session ? <LockKeyhole size={25} /> : <LoaderCircle className="animate-spin" size={25} />}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Private practice</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">登录 SpeakMate</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {session?.configured === false
              ? "服务端尚未配置个人访问密码，请先完成环境变量设置。"
              : "输入你的个人密码。MiniMax Key 只保存在服务端，不会进入手机或浏览器。"}
          </p>

          {session?.configured !== false && (
            <form onSubmit={login} className="mt-7 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="个人访问密码"
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 outline-none transition focus:border-[var(--green)]"
              />
              <button
                type="submit"
                disabled={!password || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--green)] px-4 py-3.5 font-bold text-white disabled:opacity-50"
              >
                {submitting && <LoaderCircle className="animate-spin" size={18} />}
                登录
              </button>
            </form>
          )}
          {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {session?.configured === false && (
            <code className="mt-5 block rounded-2xl bg-[var(--paper)] p-4 text-xs leading-6 text-[var(--muted)]">
              APP_ACCESS_PASSWORD=你的密码<br />
              APP_SESSION_SECRET=随机长字符串
            </code>
          )}
        </section>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ authEnabled: session.authEnabled, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
