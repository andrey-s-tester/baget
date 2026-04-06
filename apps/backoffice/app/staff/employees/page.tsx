"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type AccessUser = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "manager" | "worker" | "seller" | "dealer" | "master";
  isActive: boolean;
  createdAt: string;
  employee?: {
    storeId: string | null;
    store?: { name: string } | null;
  } | null;
};

type EditForm = {
  name: string;
  email: string;
  role: AccessUser["role"];
  storeId: string;
  isActive: boolean;
  newPassword: string;
};

const ROLE_LABELS: Record<AccessUser["role"], string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  worker: "Сотрудник",
  seller: "Продавец",
  dealer: "Дилер",
  master: "Мастер"
};

export default function StaffEmployeesPage() {
  const { user: sessionUser, permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [stores, setStores] = useState<{ id: string; name: string; isActive?: boolean }[]>([]);
  const [newAccess, setNewAccess] = useState({
    name: "",
    email: "",
    role: "worker" as AccessUser["role"],
    storeId: "",
    password: ""
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AccessUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" };

  async function load() {
    setLoading(true);
    try {
      const [usersRes, storesRes] = await Promise.all([
        fetch("/api/auth/users", fetchOpts),
        fetch("/api/stores", fetchOpts)
      ]);
      const usersData = (await usersRes.json()) as { users?: AccessUser[] };
      const storesData = await storesRes.json();
      setAccessUsers(Array.isArray(usersData?.users) ? usersData.users : []);
      setStores(Array.isArray(storesData) ? storesData : []);
    } catch {
      setAccessUsers([]);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(u: AccessUser) {
    setEditingUser(u);
    setEditForm({
      name: u.name || "",
      email: u.email,
      role: u.role,
      storeId: u.employee?.storeId ?? "",
      isActive: u.isActive,
      newPassword: ""
    });
  }

  function closeEdit() {
    setEditingUser(null);
    setEditForm(null);
  }

  const addAccessUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccess.email.trim() || newAccess.password.length < 6) return;
    try {
      const res = await fetch("/api/auth/users", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccess)
      });
      const data = await res.json();
      if (data.ok) {
        setNewAccess({ name: "", email: "", role: "worker", storeId: "", password: "" });
        await load();
        toast.success("Сотрудник добавлен");
      } else {
        toast.error(data.message || "Не удалось добавить");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  async function sessionLogoutAndLogin() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
  }

  const deleteAccessUser = async (id: string) => {
    if (!confirm("Удалить сотрудника? Это действие нельзя отменить.")) return;
    try {
      setDeletingId(id);
      const res = await fetch(`/api/auth/users/${id}`, { ...fetchOpts, method: "DELETE" });
      const text = await res.text();
      let data: { ok?: boolean; message?: string };
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, message: text || `HTTP ${res.status}` };
      }
      if (data.ok) {
        if (sessionUser?.id === id) {
          toast.success("Учётная запись удалена");
          await sessionLogoutAndLogin();
          return;
        }
        closeEdit();
        await load();
        toast.success("Сотрудник удалён");
      } else {
        toast.error("Ошибка удаления: " + (data.message || res.status));
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setDeletingId(null);
    }
  };

  const updateAccessUser = async (
    id: string,
    patch: {
      name?: string;
      email?: string;
      role?: AccessUser["role"];
      storeId?: string;
      isActive?: boolean;
      password?: string;
    }
  ) => {
    try {
      setSavingId(id);
      const res = await fetch(`/api/auth/users/${id}`, {
        ...fetchOpts,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (data.ok) {
        if (patch.isActive === false && sessionUser?.id === id) {
          toast.success("Доступ отключён — выход из системы");
          await sessionLogoutAndLogin();
          return;
        }
        closeEdit();
        await load();
        toast.success("Изменения сохранены");
      } else {
        toast.error("Ошибка сохранения: " + (data.message || res.status));
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSavingId(null);
    }
  };

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser || !editForm) return;
    if (editForm.isActive === false && editingUser.isActive) {
      const self = sessionUser?.id === editingUser.id;
      const ok = confirm(
        self
          ? "Отключить свою учётную запись? Вас сразу выйдет из админки."
          : `Отключить пользователя ${editingUser.email}? Он потеряет доступ к админке.`
      );
      if (!ok) return;
    }
    const pwd = editForm.newPassword.trim();
    if (pwd.length > 0 && pwd.length < 6) {
      toast.error("Пароль — от 6 символов или оставьте поле пустым");
      return;
    }
    await updateAccessUser(editingUser.id, {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role,
      storeId: editForm.storeId,
      isActive: editForm.isActive,
      ...(pwd.length >= 6 ? { password: pwd } : {})
    });
  }

  if (loading) return <BoTablePageSkeleton titleWidth={200} />;

  if (!can("staff_employees")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Сотрудники» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Сотрудники</h1>
        <p className="bo-page-subtitle">
          Учётные записи, магазины, роли. Матрицу прав настраивайте в{" "}
          <Link href="/staff/permissions" style={{ color: "var(--bo-accent)" }}>
            Права ролей
          </Link>
          .
        </p>
      </div>

      <section style={{ marginBottom: 28 }}>
        <form onSubmit={addAccessUser} className="bo-form-row">
          <input
            className="bo-input"
            placeholder="Имя (необязательно)"
            value={newAccess.name}
            onChange={(e) => setNewAccess((p) => ({ ...p, name: e.target.value }))}
            style={{ minWidth: 120 }}
          />
          <input
            className="bo-input"
            placeholder="Email"
            type="email"
            value={newAccess.email}
            onChange={(e) => setNewAccess((p) => ({ ...p, email: e.target.value }))}
            style={{ minWidth: 190 }}
          />
          <select
            className="bo-select"
            value={newAccess.role}
            onChange={(e) =>
              setNewAccess((p) => ({ ...p, role: e.target.value as AccessUser["role"] }))
            }
            style={{ minWidth: 130 }}
          >
            <option value="owner">{ROLE_LABELS.owner}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="manager">{ROLE_LABELS.manager}</option>
            <option value="worker">{ROLE_LABELS.worker}</option>
            <option value="seller">{ROLE_LABELS.seller}</option>
            <option value="dealer">{ROLE_LABELS.dealer}</option>
            <option value="master">{ROLE_LABELS.master}</option>
          </select>
          <select
            className="bo-select"
            value={newAccess.storeId}
            onChange={(e) => setNewAccess((p) => ({ ...p, storeId: e.target.value }))}
            style={{ minWidth: 150 }}
          >
            <option value="">— Магазин —</option>
            {stores
              .filter((s) => s.isActive !== false)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <input
            className="bo-input"
            placeholder="Пароль (>=6)"
            type="password"
            value={newAccess.password}
            onChange={(e) => setNewAccess((p) => ({ ...p, password: e.target.value }))}
            style={{ minWidth: 150 }}
          />
          <button type="submit" className="bo-btn bo-btn-primary">
            Создать доступ
          </button>
        </form>

        <div className="bo-card">
          {accessUsers.length === 0 ? (
            <div className="bo-empty">Нет учётных записей сотрудников</div>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Email</th>
                  <th>Магазин</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {accessUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>{u.name || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>{u.email}</td>
                    <td style={{ padding: "12px 16px", color: "var(--bo-text-muted)" }}>
                      {u.employee?.store?.name ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>{ROLE_LABELS[u.role]}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: u.isActive ? "#dcfce7" : "#fee2e2",
                          color: u.isActive ? "#166534" : "#991b1b"
                        }}
                      >
                        {u.isActive ? "Активен" : "Отключён"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        type="button"
                        className="bo-btn bo-btn-secondary"
                        onClick={() => openEdit(u)}
                        disabled={savingId === u.id || deletingId === u.id}
                        style={{ fontSize: 13 }}
                      >
                        Редактировать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editingUser && editForm ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16
          }}
          onClick={closeEdit}
          role="presentation"
        >
          <div
            className="bo-card bo-card-body"
            style={{
              width: "100%",
              maxWidth: 440,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Редактирование</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--bo-text-muted)" }}>
              {editingUser.email}
            </p>
            <form onSubmit={submitEdit} style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Имя
                <input
                  className="bo-input"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Email
                <input
                  className="bo-input"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, email: e.target.value } : f))}
                  required
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Роль
                <select
                  className="bo-select"
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, role: e.target.value as AccessUser["role"] } : f
                    )
                  }
                >
                  <option value="owner">{ROLE_LABELS.owner}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                  <option value="manager">{ROLE_LABELS.manager}</option>
                  <option value="worker">{ROLE_LABELS.worker}</option>
                  <option value="seller">{ROLE_LABELS.seller}</option>
                  <option value="dealer">{ROLE_LABELS.dealer}</option>
                  <option value="master">{ROLE_LABELS.master}</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Магазин
                <select
                  className="bo-select"
                  value={editForm.storeId}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, storeId: e.target.value } : f))}
                >
                  <option value="">— Не назначен —</option>
                  {stores
                    .filter((s) => s.isActive !== false)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, isActive: e.target.checked } : f))
                  }
                />
                Учётная запись активна
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Новый пароль (оставьте пустым, если не меняете)
                <input
                  className="bo-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Минимум 6 символов"
                  value={editForm.newPassword}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, newPassword: e.target.value } : f))
                  }
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                <button
                  type="submit"
                  className="bo-btn bo-btn-primary"
                  disabled={savingId === editingUser.id}
                >
                  {savingId === editingUser.id ? "Сохранение…" : "Сохранить"}
                </button>
                <button type="button" className="bo-btn bo-btn-ghost" onClick={closeEdit}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="bo-btn bo-btn-ghost"
                  style={{
                    marginLeft: "auto",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    background: "#fef2f2"
                  }}
                  disabled={deletingId === editingUser.id || savingId === editingUser.id}
                  onClick={() => void deleteAccessUser(editingUser.id)}
                >
                  {deletingId === editingUser.id ? "…" : "Удалить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
