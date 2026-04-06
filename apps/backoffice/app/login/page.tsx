"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SAVED_LOGIN_KEY = "yanak-backoffice-saved-login";

type SavedLoginPayload = { v: 1; email: string; password: string };

function readSavedLogin(): SavedLoginPayload | null {
  try {
    const raw = localStorage.getItem(SAVED_LOGIN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedLoginPayload>;
    if (data?.v !== 1 || typeof data.email !== "string" || typeof data.password !== "string") return null;
    return { v: 1, email: data.email, password: data.password };
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("next");
    if (fromQuery && fromQuery.startsWith("/")) {
      setNextPath(fromQuery);
    }
    const saved = readSavedLogin();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
      setRememberDevice(true);
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = (payload as { message?: string })?.message || `Ошибка ${res.status}`;
        throw new Error(message);
      }
      if (rememberDevice) {
        const payload: SavedLoginPayload = { v: 1, email, password };
        localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(SAVED_LOGIN_KEY);
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bo-login-page">
      <div className="bo-login-panel">
        <div className="bo-login-brand">
          <span className="bo-login-brand-mark" aria-hidden />
          <div>
            <div className="bo-login-brand-name">Yanak</div>
            <div className="bo-login-brand-tagline">Админ-панель мастерской</div>
          </div>
        </div>
        <form className="bo-login-form" onSubmit={onSubmit}>
          <h1 className="bo-login-title">Вход</h1>
          <p className="bo-login-lead">Работа с заказами, каталогом и складом</p>
          <label className="bo-login-label">
            Email
            <input
              className="bo-input bo-login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="bo-login-label">
            Пароль
            <input
              className="bo-input bo-login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label className="bo-login-remember">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => {
                const checked = e.target.checked;
                setRememberDevice(checked);
                if (!checked) localStorage.removeItem(SAVED_LOGIN_KEY);
              }}
            />
            <span className="bo-login-remember__text">
              <strong>Сохранить данные на этом устройстве</strong>
              <small>Не включайте на общих компьютерах — пароль хранится локально в браузере.</small>
            </span>
          </label>
          {error ? <p className="bo-login-error">{error}</p> : null}
          <button type="submit" className="bo-btn bo-btn-primary bo-login-submit" disabled={loading}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}
