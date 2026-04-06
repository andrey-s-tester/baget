/**
 * URL для запросов к своему `/api/*` из клиента.
 *
 * - В iframe на `http://localhost` внутри HTTPS-админки Chrome считает смешанным контентом
 *   запросы к `http://localhost/...` → нужен **https** на тот же host:port, если сервер слушает TLS.
 * - Иначе достаточно протокол-относительного `//host/path` (схема как у документа).
 * - `NEXT_PUBLIC_WEB_ORIGIN`: если hostname совпадает с текущим — берём его origin (схема из .env).
 * - Админка может открывать `/embed?yanakParentHttps=1` (см. NEXT_PUBLIC_IFRAME_PARENT_IS_HTTPS) —
 *   referrer с HTTPS-родителя часто обрезается при http-iframe.
 */
function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function shouldUseHttpsBaseForLoopbackProxy(loc: Location): boolean {
  if (loc.protocol !== "http:") return false;
  if (!isLoopbackHost(loc.hostname)) return false;
  try {
    if (new URL(loc.href).searchParams.get("yanakParentHttps") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    const ref = document.referrer?.trim();
    if (ref && new URL(ref).protocol === "https:") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function sameOriginApiPath(pathWithQuery: string): string {
  if (typeof window === "undefined") return pathWithQuery;
  if (!pathWithQuery.startsWith("/")) return pathWithQuery;

  const loc = window.location;
  const raw = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim();
  if (raw) {
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const cfg = new URL(withScheme);
      if (cfg.hostname === loc.hostname) {
        return new URL(pathWithQuery, cfg.origin).href;
      }
    } catch {
      /* ignore */
    }
  }

  let baseOrigin = loc.origin;
  if (
    process.env.NEXT_PUBLIC_DISABLE_PROXY_HTTPS_UPGRADE !== "1" &&
    shouldUseHttpsBaseForLoopbackProxy(loc)
  ) {
    baseOrigin = `https://${loc.host}`;
  }

  return new URL(pathWithQuery, baseOrigin).href;
}

/** Прокси для внешних изображений (canvas / превью). */
export function remoteImageViaProxy(src: string, opts?: { strict?: boolean }): string {
  if (!src.startsWith("http")) return src;
  const q = new URLSearchParams({ url: src });
  if (opts?.strict) q.set("strict", "1");
  return sameOriginApiPath(`/api/image-proxy?${q.toString()}`);
}
