import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "@yanak/constructor/constructor.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  adjustFontFallback: true
});

/** Не кэшировать HTML витрины — конструктор и заказ подтягивают свежие чанки после выкладки. */
export const dynamic = "force-dynamic";

const FALLBACK_WEB_ORIGIN = "http://localhost:3000";

function webMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim();
  if (!raw) return new URL(FALLBACK_WEB_ORIGIN);
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(withScheme);
  } catch {
    return new URL(FALLBACK_WEB_ORIGIN);
  }
}

export const metadata: Metadata = {
  metadataBase: webMetadataBase(),
  title: "Янак — багетная мастерская",
  description: "Конструктор стоимости багета и заказ",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }]
  }
};

export default async function RootLayout(props: {
  children: React.ReactNode;
  params?: Promise<Record<string, string>>;
}) {
  if (props.params) await props.params;
  const { children } = props;
  return (
    <html lang="ru" className={inter.className}>
      <body
        style={{
          margin: 0,
          background: "#f0f2f5",
          color: "#0f172a"
        }}
      >
        <noscript>
          <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
            Для работы конструктора включите JavaScript в браузере.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
