"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    error?.message?.includes("Loading chunk") ||
    error?.message?.includes("ChunkLoadError");

  return (
    <html lang="ru">
      <body>
        <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
          <h1 style={{ color: "#dc2626" }}>Ошибка приложения</h1>
          {isChunkError ? (
            <>
              <p style={{ marginTop: 16, color: "#475569" }}>
                Устаревшая версия в кэше браузера.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.href =
                    window.location.pathname + "?_=" + Date.now();
                }}
                style={{
                  marginTop: 16,
                  padding: "10px 20px",
                  fontSize: 16,
                  cursor: "pointer",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8
                }}
              >
                Перезагрузить страницу
              </button>
              <p style={{ marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
                Или нажмите Ctrl+Shift+R для жёсткого обновления.
              </p>
            </>
          ) : (
            <>
              <pre
                style={{
                  background: "#f1f5f9",
                  padding: 16,
                  borderRadius: 8,
                  overflow: "auto",
                  fontSize: 13,
                  marginTop: 16
                }}
              >
                {error?.message || "Unknown error"}
              </pre>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  marginTop: 16,
                  padding: "10px 20px",
                  fontSize: 16,
                  cursor: "pointer"
                }}
              >
                Повторить
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
