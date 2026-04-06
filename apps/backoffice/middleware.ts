import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
import { AUTH_SESSION_COOKIE } from "./app/lib/auth-constants";

const AUTH_COOKIE_NAME = AUTH_SESSION_COOKIE;
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  /** Прокси к Nest: валидация cookie на API, middleware не режет запрос «без обхода» */
  "/api/auth/me",
  "/api/pricing",
  "/api/materials",
  "/api/catalog/frames",
  "/api/catalog/matboard",
  "/api/image-proxy",
  /** Картинки каталога: allowlist URL внутри route */
  "/api/resolved-frame-image"
];

const AUTH_CHECK_TIMEOUT_MS = 12000;

async function hasSession(request: NextRequest): Promise<boolean> {
  try {
    const cookie = request.headers.get("cookie") || "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (isPublicApi) return NextResponse.next();
  }

  const isLoginPage = pathname === "/login";
  const isApiRoute = pathname.startsWith("/api");
  const hasSessionCookie = request.cookies.has(AUTH_COOKIE_NAME);
  if (!hasSessionCookie && !isLoginPage) {
    if (isApiRoute) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Fast path for page navigations: avoid network auth check on each transition.
  if (!isApiRoute && !isLoginPage && hasSessionCookie) {
    return NextResponse.next();
  }
  if (hasSessionCookie && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isApiRoute) {
    const authenticated = await hasSession(request);
    if (!authenticated) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Явно исключаем _next и статику — иначе 400 на chunks
  matcher: ["/((?!_next|favicon\\.ico|\\.ico|\\.png|\\.js|\\.css|\\.woff2?|\\.svg|\\.jpg|\\.jpeg|\\.gif|\\.webp).*)"]
};
