import type { NextConfig } from "next";

// Тот же приоритет, что у прокси в apps/backoffice/app/api/** — иначе витрина и админка смотрят на разные Nest/БД.
// API_URL (если задан) переопределяет остальное — см. .env.example
const apiUrl =
  process.env.API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.BACKOFFICE_URL ||
  "http://localhost:4000";

const nextConfig: NextConfig = {
  typedRoutes: false,
  transpilePackages: ["@yanak/pricing", "@yanak/receipt", "@yanak/types", "@yanak/ui", "@yanak/constructor"],
  onDemandEntries: {
    maxInactiveAge: 45 * 60 * 1000,
    pagesBufferLength: 12
  },
  async rewrites() {
    const dest = apiUrl.replace(/\/$/, "");
    /**
     * Нельзя проксировать весь `/api/*` на Nest: на витрине есть свои route handlers
     * (`/api/image-proxy`, `/api/catalog/*`, `/api/resolved-frame-image`). Иначе картинки
     * уходят на BACKEND_API_URL (другой хост/порт) → mixed content в iframe и поломка canvas.
     */
    return [
      { source: "/favicon.ico", destination: "/icon.svg" },
      { source: "/api/pricing/calculate", destination: `${dest}/api/pricing/calculate` },
      { source: "/api/promo-codes/:path*", destination: `${dest}/api/promo-codes/:path*` },
      { source: "/api/customers/:path*", destination: `${dest}/api/customers/:path*` },
      { source: "/api/stores/:path*", destination: `${dest}/api/stores/:path*` },
      { source: "/api/materials/:path*", destination: `${dest}/api/materials/:path*` },
      { source: "/api/orders/:path*", destination: `${dest}/api/orders/:path*` },
      { source: "/api/pricing", destination: `${dest}/api/pricing` },
      { source: "/api/promo-codes", destination: `${dest}/api/promo-codes` },
      { source: "/api/customers", destination: `${dest}/api/customers` },
      { source: "/api/stores", destination: `${dest}/api/stores` },
      { source: "/api/materials", destination: `${dest}/api/materials` },
      { source: "/api/orders", destination: `${dest}/api/orders` }
    ];
  }
};

export default nextConfig;
