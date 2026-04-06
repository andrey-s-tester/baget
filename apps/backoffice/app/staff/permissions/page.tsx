"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type Definition = { key: string; label: string; group: string };

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  worker: "Сотрудник",
  seller: "Продавец",
  dealer: "Дилер",
  master: "Мастер"
};

type MatrixPayload = {
  ok?: boolean;
  definitions?: Definition[];
  roles?: string[];
  matrix?: Record<string, Record<string, boolean>>;
};

export default function RolePermissionsPage() {
  const router = useRouter();
  const { user, permissions, loading: sessionLoading, refresh } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const canOpenMatrix = permEmpty || permissions?.role_permissions === true;
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!permEmpty && permissions && permissions.role_permissions !== true) {
      router.replace("/dashboard");
    }
  }, [sessionLoading, user, permissions, router, permEmpty]);

  useEffect(() => {
    if (sessionLoading || !user || !canOpenMatrix) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/role-permissions", { cache: "no-store" });
        const json = (await res.json()) as MatrixPayload;
        if (!cancelled) {
          if (res.ok && json.ok) setData(json);
          else setLoadError("Не удалось загрузить матрицу прав");
        }
      } catch {
        if (!cancelled) setLoadError("Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user, canOpenMatrix]);

  const grouped = useMemo(() => {
    const defs = data?.definitions ?? [];
    const map = new Map<string, Definition[]>();
    for (const d of defs) {
      const g = d.group || "Прочее";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(d);
    }
    return Array.from(map.entries());
  }, [data?.definitions]);

  async function toggleCell(role: string, key: string, next: boolean) {
    if (role === "owner") return;
    const id = `${role}:${key}`;
    setSavingKey(id);
    try {
      const res = await fetch("/api/auth/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, key, allowed: next })
      });
      const json = (await res.json()) as MatrixPayload;
      if (json.ok) {
        setData(json);
        await refresh();
        toast.success("Права сохранены");
      } else {
        toast.error("Ошибка сохранения");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSavingKey(null);
    }
  }

  if (sessionLoading) {
    return <div className="bo-empty">Загрузка…</div>;
  }
  if (!user) {
    return <div className="bo-empty">Переход на страницу входа…</div>;
  }
  if (!canOpenMatrix) {
    return <div className="bo-empty">Нет доступа к матрице прав. Перенаправление…</div>;
  }

  if (loadError) {
    return <div className="bo-empty">{loadError}</div>;
  }

  if (!data?.definitions?.length) {
    return <BoTablePageSkeleton titleWidth={200} />;
  }

  const roles = data?.roles ?? [];
  const matrix = data?.matrix ?? {};

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Права ролей</h1>
        <p className="bo-page-subtitle">
          Отдельная подкатегория «Сотрудники»: какие разделы и функции доступны каждой роли. У
          владельца всегда полный доступ (изменить нельзя).
        </p>
      </div>

      <div className="bo-card" style={{ overflowX: "auto" }}>
        <table className="bo-table bo-perm-matrix">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Функция / раздел</th>
              {roles.map((r) => (
                <th key={r} style={{ textAlign: "center", minWidth: 110 }}>
                  {ROLE_LABELS[r] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([group, defs]) => (
              <Fragment key={group}>
                <tr className="bo-perm-group-row">
                  <td colSpan={roles.length + 1}>{group}</td>
                </tr>
                {defs.map((def) => (
                  <tr key={def.key}>
                    <td style={{ fontWeight: 500 }}>{def.label}</td>
                    {roles.map((r) => {
                      const allowed = Boolean(matrix[r]?.[def.key]);
                      const disabled = r === "owner" || savingKey === `${r}:${def.key}`;
                      return (
                        <td key={r} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={allowed}
                            disabled={disabled}
                            title={
                              r === "owner"
                                ? "У владельца всегда полный доступ"
                                : def.label
                            }
                            onChange={(e) => void toggleCell(r, def.key, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
