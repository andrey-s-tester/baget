"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>Ошибка конструктора</h1>
        <p style={{ color: "#555" }}>{error.message || "Не удалось загрузить страницу"}</p>
        <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
