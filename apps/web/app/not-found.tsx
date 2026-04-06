import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
      <h1 style={{ fontSize: 20 }}>Страница не найдена</h1>
      <p style={{ color: "#555" }}>Запрошенный адрес не существует.</p>
      <Link href="/" style={{ color: "#2563eb" }}>
        На главную
      </Link>
    </div>
  );
}
