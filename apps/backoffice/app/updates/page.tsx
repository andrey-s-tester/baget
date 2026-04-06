"use client";

import { useEffect, useState } from "react";
import { useBackofficeSession } from "../components/BackofficeSession";
import { canSeeNavItem } from "../lib/nav-permissions";
import releasesCatalog from "../../content/app-releases.json";

type ManifestOk = {
  ok: true;
  latest: string;
  downloadUrl: string;
  releaseNotes?: string;
  minRequired?: string;
};

type ManifestErr = { ok: false; message?: string };

type Manifest = ManifestOk | ManifestErr;

type ReleaseEntry = {
  version: string;
  date: string;
  channel?: string;
  summary?: string;
  items?: string[];
};

function formatChannel(ch: string | undefined) {
  if (!ch) return null;
  const map: Record<string, string> = { stable: "Стабильный", beta: "Бета", internal: "Внутренний" };
  return map[ch] ?? ch;
}

export default function UpdatesPage() {
  const { user, permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => canSeeNavItem(user, permissions, k, failOpen);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setManifestLoading(true);
      try {
        const res = await fetch("/api/system/desktop-admin-update", {
          credentials: "include",
          cache: "no-store"
        });
        const data = (await res.json()) as Manifest;
        if (!cancelled) setManifest(data);
      } catch {
        if (!cancelled) setManifest({ ok: false, message: "Не удалось загрузить манифест" });
      } finally {
        if (!cancelled) setManifestLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!can("app_releases")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Обновления» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  const releases = [...(releasesCatalog.releases as ReleaseEntry[])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">{releasesCatalog.title}</h1>
        <p className="bo-page-subtitle">{releasesCatalog.maintainerNote}</p>
      </div>

      <div className="bo-card" style={{ marginBottom: 20 }}>
        <h2 className="bo-section-title" style={{ marginTop: 0 }}>
          Десктоп: манифест с API
        </h2>
        <p style={{ fontSize: 14, color: "var(--bo-text-muted)", marginBottom: 16 }}>
          Клиенты <strong>{releasesCatalog.desktopAppName}</strong> забирают актуальную версию и ссылку на
          установщик с эндпоинта <code className="bo-code">/api/system/desktop-admin-update</code> (через
          публичный URL API). Задайте на сервере API переменные{" "}
          <code className="bo-code">DESKTOP_ADMIN_LATEST_VERSION</code>,{" "}
          <code className="bo-code">DESKTOP_ADMIN_DOWNLOAD_URL</code> и при необходимости{" "}
          <code className="bo-code">DESKTOP_ADMIN_RELEASE_NOTES</code>,{" "}
          <code className="bo-code">DESKTOP_ADMIN_MIN_VERSION</code>.
        </p>
        {manifestLoading ? (
          <div className="bo-empty" style={{ padding: "12px 0" }}>
            Загрузка манифеста…
          </div>
        ) : manifest && manifest.ok === true ? (
          <dl className="bo-dl">
            <div>
              <dt>Актуальная версия (для клиентов)</dt>
              <dd>{manifest.latest}</dd>
            </div>
            <div>
              <dt>Ссылка на установщик</dt>
              <dd>
                <a href={manifest.downloadUrl} className="bo-link" target="_blank" rel="noreferrer">
                  {manifest.downloadUrl}
                </a>
              </dd>
            </div>
            {manifest.minRequired ? (
              <div>
                <dt>Минимально требуемая версия</dt>
                <dd>{manifest.minRequired}</dd>
              </div>
            ) : null}
            {manifest.releaseNotes ? (
              <div>
                <dt>Текст релиза (в манифесте)</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{manifest.releaseNotes}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              background: "#f1f5f9",
              fontSize: 14
            }}
          >
            <strong>Манифест не настроен или API недоступен.</strong>
            <p style={{ margin: "8px 0 0" }}>
              {(manifest && "message" in manifest && manifest.message) ||
                "Проверьте BACKEND_API_URL и переменные DESKTOP_ADMIN_* на API."}
            </p>
          </div>
        )}
      </div>

      <div className="bo-card">
        <h2 className="bo-section-title" style={{ marginTop: 0 }}>
          Журнал релизов (репозиторий)
        </h2>
        <p style={{ fontSize: 14, color: "var(--bo-text-muted)", marginBottom: 20 }}>
          Ниже — структурированная история для команды. Добавляйте записи в JSON сверху списка по дате или
          правьте порядок в файле.
        </p>
        <ul className="bo-release-list">
          {releases.map((r) => (
            <li key={`${r.version}-${r.date}`} className="bo-release-item">
              <div className="bo-release-head">
                <span className="bo-release-version">v{r.version}</span>
                <span className="bo-release-date">{r.date}</span>
                {r.channel ? (
                  <span className="bo-release-channel">{formatChannel(r.channel)}</span>
                ) : null}
              </div>
              {r.summary ? <p className="bo-release-summary">{r.summary}</p> : null}
              {r.items && r.items.length > 0 ? (
                <ul className="bo-release-bullets">
                  {r.items.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
