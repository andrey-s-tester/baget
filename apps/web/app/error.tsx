"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1 style={{ fontSize: 20 }}>Что-то пошло не так</h1>
      <p style={{ color: "#555" }}>{error.message || "Ошибка приложения"}</p>
      <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
        Попробовать снова
      </button>
    </div>
  );
}
