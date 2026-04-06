import "./globals.css";
import type { Metadata, Viewport } from "next";

/** Не кэшировать раздачу страниц на CDN/прокси — иначе после деплоя долго виден старый UI. */
export const dynamic = "force-dynamic";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { BackofficeSessionProvider } from "./components/BackofficeSession";
import { SidebarLayout } from "./components/SidebarLayout";

const FALLBACK_BACKOFFICE_ORIGIN = "http://localhost:3001";

function backofficeMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_BACKOFFICE_ORIGIN?.trim();
  if (!raw) return new URL(FALLBACK_BACKOFFICE_ORIGIN);
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(withScheme);
  } catch {
    return new URL(FALLBACK_BACKOFFICE_ORIGIN);
  }
}

export const metadata: Metadata = {
  metadataBase: backofficeMetadataBase(),
  title: "Янак — админка",
  description: "Склад, заказы, каталог",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap"
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable} suppressHydrationWarning>
      <body className={`${manrope.className} bo-body`} suppressHydrationWarning>
        <BackofficeSessionProvider>
          <SidebarLayout>{children}</SidebarLayout>
        </BackofficeSessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: "var(--bo-toast-bg)",
              color: "var(--bo-toast-fg)",
              borderRadius: "12px",
              boxShadow: "var(--bo-shadow-lg)",
              border: "1px solid var(--bo-border)",
              fontSize: "14px"
            }
          }}
        />
      </body>
    </html>
  );
}
