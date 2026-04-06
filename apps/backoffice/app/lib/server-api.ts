/** Прямой URL Nest из RSC (без loopback через Next /api — меньше задержка TTFB). */
export function getServerApiBase(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000"
  ).replace(/\/$/, "");
}
