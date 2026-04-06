import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Корень монорепо — для standalone (трейсинг `packages/*` в десктопную сборку). */
const repoRoot = path.join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Сборка сервера для встраивания в Electron (локальный UI, не внешний URL). */
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@yanak/pricing", "@yanak/receipt", "@yanak/types", "@yanak/ui", "@yanak/constructor"],
  reactStrictMode: false,
  /** Браузеры запрашивают /favicon.ico — отдаём тот же SVG, что и app/icon.svg */
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  /**
   * Dev: слишком большой буфер + долгий age иногда дают «Cannot find module ./NNN.js»
   * после смены чанков (dynamic import / HMR) — оставляем умеренные значения.
   */
  onDemandEntries: {
    maxInactiveAge: 45 * 60 * 1000,
    pagesBufferLength: 12
  },
  experimental: {
    optimizePackageImports: ["react-hot-toast"]
  },
  /**
   * В монорепо при `next dev` (webpack) иначе любое сохранение в apps/api, apps/web, prisma…
   * даёт полный Fast Refresh админки (~0.7–1.3s). Игнорируем чужие приложения и тяжёлые каталоги.
   * (Turbopack сам другой watcher; для webpack — явный список.)
   */
  webpack: (config, { dev }) => {
    if (dev) {
      // Строковые glob (Webpack 5 + схема валидации): RegExp/абсолютные пути в ignored давали Invalid configuration в Docker.
      config.watchOptions = {
        ...config.watchOptions,
        ...(process.env.WATCHPACK_POLLING === "true" ? { poll: 1000 } : {}),
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/apps/web/**",
          "**/apps/api/**",
          "**/prisma/**",
          "**/data/**",
          "**/scripts/**",
          "**/docs/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
