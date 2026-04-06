/** Очистка устаревшего ключа после отключения клиентского кэша сессии. */
export const SESSION_CACHE_KEY = "yanak_bo_session_v1";

export function clearSessionCache() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
