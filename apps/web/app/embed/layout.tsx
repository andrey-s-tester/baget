import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Конструктор — встраивание",
  robots: { index: false, follow: false }
};

/** Без шапки сайта — для iframe в бэкофисе (быстрее первый экран). */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="embed-constructor-shell">{children}</div>;
}
