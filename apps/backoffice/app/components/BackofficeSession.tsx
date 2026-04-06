"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";
import { clearSessionCache } from "../lib/session-cache";

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  /** Магазин из карточки сотрудника (Employee.store), любая роль бэкофиса — витрина, заказы, отчёты. */
  sellerStoreId?: string | null;
  sellerStoreName?: string | null;
};

type SessionContextValue = {
  user: SessionUser | null;
  permissions: Record<string, boolean> | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BackofficeSessionContext = createContext<SessionContextValue | null>(null);

export function BackofficeSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionFetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store"
      });
      if (!res.ok) {
        clearSessionCache();
        setUser(null);
        setPermissions(null);
        return;
      }
      const data = (await res.json()) as {
        user?: SessionUser;
        permissions?: Record<string, boolean>;
      };
      if (data.user) setUser(data.user);
      else setUser(null);
      if (data.permissions && typeof data.permissions === "object") {
        setPermissions(data.permissions);
      } else {
        setPermissions({});
      }
    } catch {
      clearSessionCache();
      setUser(null);
      setPermissions(null);
    }
  }, []);

  useLayoutEffect(() => {
    if (pathname === "/login") {
      sessionFetchedRef.current = false;
      clearSessionCache();
      setLoading(false);
      setUser(null);
      setPermissions(null);
      return;
    }
    if (sessionFetchedRef.current) return;

    sessionFetchedRef.current = true;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [pathname, refresh]);

  useEffect(() => {
    if (pathname === "/login") return;
    let last = 0;
    const bump = () => {
      const now = Date.now();
      if (now - last < 120_000) return;
      last = now;
      void refresh();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname, refresh]);

  return (
    <BackofficeSessionContext.Provider value={{ user, permissions, loading, refresh }}>
      {children}
    </BackofficeSessionContext.Provider>
  );
}

export function useBackofficeSession(): SessionContextValue {
  const ctx = useContext(BackofficeSessionContext);
  if (!ctx) {
    throw new Error("useBackofficeSession must be used within BackofficeSessionProvider");
  }
  return ctx;
}

export function usePermission(key: string): boolean {
  const { permissions } = useBackofficeSession();
  if (!permissions) return false;
  return Boolean(permissions[key]);
}
