"use client";

import { useEffect } from "react";

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || "";
  const name = error.name || "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module")
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Backoffice error:", error);
  }, [error]);

  const handleRetry = () => {
    if (typeof window !== "undefined" && isChunkLoadError(error)) {
      window.location.href = window.location.pathname + window.location.search + "?_=" + Date.now();
      return;
    }
    reset();
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ color: "#dc2626" }}>Ошибка</h1>
      {isChunkLoadError(error) && (
        <p style={{ color: "#64748b", marginTop: 8 }}>
          Устаревшая версия. Нажмите кнопку для полной перезагрузки.
        </p>
      )}
      <pre
        style={{
          background: "#f1f5f9",
          padding: 16,
          borderRadius: 8,
          overflow: "auto",
          fontSize: 13,
          marginTop: 16,
        }}
      >
        {error.message}
      </pre>
      <button
        type="button"
        onClick={handleRetry}
        className="bo-btn bo-btn-primary"
        style={{ marginTop: 16 }}
      >
        {isChunkLoadError(error) ? "Перезагрузить страницу" : "Повторить"}
      </button>
    </div>
  );
}
