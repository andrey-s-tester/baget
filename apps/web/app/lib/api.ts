/**
 * Прямой URL на Nest из браузера (если задан NEXT_PUBLIC_API_BASE_URL).
 * Каталог багета/паспарту на витрине загружается через same-origin `/api/catalog/...`,
 * чтобы остатки совпадали с админкой (один серверный прокси и BACKEND_API_URL).
 */
export function publicApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return p;
  let base = raw.replace(/\/$/, "");
  if (p.startsWith("/api/") && (base.endsWith("/api") || base.endsWith("/api/"))) {
    base = base.replace(/\/?api$/, "");
  }
  return `${base}${p}`;
}

export function publicApiFetchInit(): RequestInit {
  const direct = Boolean(process.env.NEXT_PUBLIC_API_BASE_URL?.trim());
  return direct
    ? { cache: "no-store" as const, credentials: "omit" as const }
    : { cache: "no-store" as const };
}
