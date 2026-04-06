"use client";

import dynamic from "next/dynamic";

const ConstructorApp = dynamic(
  () => import("@yanak/constructor").then((m) => ({ default: m.ConstructorApp })),
  {
    ssr: false,
    loading: () => (
      <p className="hint" style={{ margin: "32px 16px", textAlign: "center" }}>
        Загрузка конструктора…
      </p>
    )
  }
);

export function EmbedConstructorClient() {
  return <ConstructorApp embed />;
}
