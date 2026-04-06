"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clearSessionCache } from "../lib/session-cache";
import { canSeeNavItem } from "../lib/nav-permissions";
import { BoNavLink } from "./BoNavLink";
import { useBackofficeSession } from "./BackofficeSession";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  worker: "Сотрудник",
  seller: "Продавец",
  dealer: "Дилер",
  master: "Мастер",
  customer: "Покупатель"
};

type NavLeaf = { href: string; label: string; permission: string };

const DASHBOARD: NavLeaf = {
  href: "/dashboard",
  label: "Дашборд",
  permission: "dashboard"
};

/** Каталоги, материалы, склад, отчёты по складу */
const WAREHOUSE_MATERIALS_NAV: NavLeaf[] = [
  { href: "/catalog", label: "Каталог багета", permission: "catalog_frames" },
  { href: "/catalog-matboard", label: "Каталог паспарту", permission: "catalog_matboard" },
  { href: "/products", label: "Товары", permission: "products" },
  { href: "/materials", label: "Материалы", permission: "materials" },
  { href: "/warehouse", label: "Склад", permission: "warehouse" },
  { href: "/reports/sales", label: "Отчёт по продажам", permission: "reports_sales" },
  { href: "/reports/receipts", label: "Поступления на склад", permission: "reports_receipts" },
  { href: "/reports/movements", label: "Движения склада", permission: "reports_movements" }
];

const SALES_NAV: NavLeaf[] = [
  { href: "/orders", label: "Заказы", permission: "orders" },
  { href: "/orders/history", label: "История заказов", permission: "orders" },
  { href: "/orders/master-day", label: "Смена мастера", permission: "orders" },
  { href: "/customers", label: "Покупатели", permission: "customers" }
];

const SETTINGS_NAV: NavLeaf[] = [
  { href: "/pricing", label: "Цены и расчёт", permission: "pricing" },
  { href: "/stores", label: "Магазины", permission: "stores" },
  { href: "/promotions", label: "Акции и промо", permission: "staff_discounts" },
  { href: "/updates", label: "Обновления", permission: "app_releases" }
];

const STAFF_SUB: NavLeaf[] = [
  { href: "/staff/employees", label: "Сотрудники", permission: "staff_employees" },
  { href: "/staff/permissions", label: "Права ролей", permission: "role_permissions" }
];

const SALARY_NAV: NavLeaf[] = [
  { href: "/staff/salary", label: "Зарплаты", permission: "salary_payroll" },
  { href: "/staff/salary-algorithm", label: "Алгоритм расчёта", permission: "salary_algorithm" }
];

function isPermissionsEmpty(p: Record<string, boolean> | null | undefined): boolean {
  return !p || Object.keys(p).length === 0;
}

function canSeeStaffGroup(p: Record<string, boolean> | null, failOpen: boolean): boolean {
  if (failOpen) return true;
  if (!p) return false;
  return Boolean(p.staff_employees || p.role_permissions);
}

function canSeeWarehouseMaterialsGroup(p: Record<string, boolean> | null, failOpen: boolean): boolean {
  if (failOpen) return true;
  if (!p) return false;
  return Boolean(
    p.catalog_frames ||
      p.catalog_matboard ||
      p.products ||
      p.materials ||
      p.warehouse ||
      p.reports_sales ||
      p.reports_receipts ||
      p.reports_movements
  );
}

function canSeeSalesGroup(p: Record<string, boolean> | null, failOpen: boolean): boolean {
  if (failOpen) return true;
  if (!p) return false;
  return Boolean(p.orders || p.customers);
}

function canSeeSettingsGroup(p: Record<string, boolean> | null, failOpen: boolean): boolean {
  if (failOpen) return true;
  if (!p) return false;
  return Boolean(p.pricing || p.stores || p.staff_discounts || p.app_releases);
}

function canSeeSalaryGroup(p: Record<string, boolean> | null, failOpen: boolean): boolean {
  if (failOpen) return true;
  if (!p) return false;
  return Boolean(p.salary_payroll || p.salary_algorithm);
}

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isStaffSubActive(pathname: string, itemHref: string): boolean {
  if (itemHref === "/staff/employees") {
    return pathname === "/staff/employees" || pathname === "/staff";
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

function groupAnyActive(items: NavLeaf[], pathname: string): boolean {
  return items.some((item) => isNavActive(pathname, item.href));
}

function staffGroupAnyActive(pathname: string): boolean {
  return STAFF_SUB.some((item) => isStaffSubActive(pathname, item.href));
}

function MenuDropdown({
  id,
  label,
  pathname,
  can,
  items,
  openId,
  onOpen,
  onScheduleClose,
  onCancelClose,
  onClose
}: {
  id: string;
  label: string;
  pathname: string;
  can: (key: string) => boolean;
  items: NavLeaf[];
  openId: string | null;
  onOpen: (id: string) => void;
  onScheduleClose: () => void;
  onCancelClose: () => void;
  onClose: () => void;
}) {
  const visible = items.filter((item) => can(item.permission));
  if (visible.length === 0) return null;

  const expanded = openId === id;
  const hasActive = groupAnyActive(visible, pathname);

  return (
    <div
      className="bo-menu-root"
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={onScheduleClose}
    >
      <button
        type="button"
        className={[
          "bo-menu-trigger",
          expanded ? "is-open" : "",
          hasActive ? "has-active-child" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={expanded}
        aria-haspopup="true"
        onClick={() => (expanded ? onClose() : onOpen(id))}
      >
        {label}
        <span className="bo-menu-chevron" aria-hidden />
      </button>
      <div
        className={[
          "bo-menu-dropdown",
          expanded ? "is-visible" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        role="menu"
        onMouseEnter={onCancelClose}
      >
        {visible.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <BoNavLink
              key={item.href}
              href={item.href}
              className={active ? "bo-menu-dropdown-link is-active" : "bo-menu-dropdown-link"}
              role="menuitem"
              onClick={onClose}
            >
              {item.label}
            </BoNavLink>
          );
        })}
      </div>
    </div>
  );
}

function MobileNavLink({
  href,
  active,
  children,
  onNavigate
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <BoNavLink
      href={href}
      className={active ? "bo-mobile-nav-link is-active" : "bo-mobile-nav-link"}
      onClick={onNavigate}
    >
      {children}
    </BoNavLink>
  );
}

function StaffMenuDropdown({
  id,
  pathname,
  can,
  openId,
  onOpen,
  onScheduleClose,
  onCancelClose,
  onClose
}: {
  id: string;
  pathname: string;
  can: (key: string) => boolean;
  openId: string | null;
  onOpen: (id: string) => void;
  onScheduleClose: () => void;
  onCancelClose: () => void;
  onClose: () => void;
}) {
  const visible = STAFF_SUB.filter((item) => can(item.permission));
  if (visible.length === 0) return null;

  const expanded = openId === id;
  const hasActive = staffGroupAnyActive(pathname);

  return (
    <div
      className="bo-menu-root"
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={onScheduleClose}
    >
      <button
        type="button"
        className={[
          "bo-menu-trigger",
          expanded ? "is-open" : "",
          hasActive ? "has-active-child" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={expanded}
        aria-haspopup="true"
        onClick={() => (expanded ? onClose() : onOpen(id))}
      >
        Персонал
        <span className="bo-menu-chevron" aria-hidden />
      </button>
      <div
        className={[
          "bo-menu-dropdown",
          expanded ? "is-visible" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        role="menu"
        onMouseEnter={onCancelClose}
      >
        {visible.map((item) => {
          const active = isStaffSubActive(pathname, item.href);
          return (
            <BoNavLink
              key={item.href}
              href={item.href}
              className={active ? "bo-menu-dropdown-link is-active" : "bo-menu-dropdown-link"}
              role="menuitem"
              onClick={onClose}
            >
              {item.label}
            </BoNavLink>
          );
        })}
      </div>
    </div>
  );
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, permissions, loading } = useBackofficeSession();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  const failOpenNav = loading || isPermissionsEmpty(permissions);

  const closeMenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpenMenuId(null);
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpenMenuId(null);
    }, 220);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openMenu = useCallback((id: string) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpenMenuId(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!openMenuId) return;
      const el = layoutRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenuId, closeMenu]);

  useEffect(() => {
    closeMenu();
    setMobileNavOpen(false);
  }, [pathname, closeMenu]);

  async function onLogout() {
    clearSessionCache();
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    }).catch(() => {});
    window.location.href = "/login";
  }

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  /** Раньше класс вешался из orders/layout через useEffect — после первого кадра main «прыгал» с max-width 1440px на всю ширину */
  const ordersFullWidth = pathname.startsWith("/orders");

  const can = (key: string) => canSeeNavItem(user, permissions, key, failOpenNav);

  const staffGroupVisible = failOpenNav || canSeeStaffGroup(permissions, false);
  const warehouseMaterialsVisible =
    failOpenNav || canSeeWarehouseMaterialsGroup(permissions, false);
  const salesVisible = failOpenNav || canSeeSalesGroup(permissions, false);
  const settingsVisible = failOpenNav || canSeeSettingsGroup(permissions, false);
  const salaryVisible = failOpenNav || canSeeSalaryGroup(permissions, false);

  return (
    <div className="bo-layout" ref={layoutRef}>
      <header className="bo-topbar">
        <div className="bo-topbar-inner">
          <div className="bo-topbar-brand">
            <span className="bo-topbar-logo-mark" aria-hidden />
            <div className="bo-topbar-brand-text">
              <span className="bo-topbar-logo">Yanak</span>
              <span className="bo-topbar-tagline">Админка</span>
            </div>
          </div>

          <button
            type="button"
            className={mobileNavOpen ? "bo-nav-burger is-open" : "bo-nav-burger"}
            aria-label={mobileNavOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileNavOpen}
            aria-controls="bo-mobile-nav"
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            <span className="bo-nav-burger-line" aria-hidden />
            <span className="bo-nav-burger-line" aria-hidden />
            <span className="bo-nav-burger-line" aria-hidden />
          </button>

          <nav className="bo-menubar bo-menubar--desktop" aria-label="Разделы">
            {can(DASHBOARD.permission) ? (
              <BoNavLink
                href={DASHBOARD.href}
                className={
                  isNavActive(pathname, DASHBOARD.href)
                    ? "bo-menubar-link is-active"
                    : "bo-menubar-link"
                }
              >
                {DASHBOARD.label}
              </BoNavLink>
            ) : null}

            {warehouseMaterialsVisible ? (
              <MenuDropdown
                id="wh"
                label="Склад и материалы"
                pathname={pathname}
                can={can}
                items={WAREHOUSE_MATERIALS_NAV}
                openId={openMenuId}
                onOpen={openMenu}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={closeMenu}
              />
            ) : null}

            {salesVisible ? (
              <MenuDropdown
                id="sales"
                label="Продажи"
                pathname={pathname}
                can={can}
                items={SALES_NAV}
                openId={openMenuId}
                onOpen={openMenu}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={closeMenu}
              />
            ) : null}

            {settingsVisible ? (
              <MenuDropdown
                id="settings"
                label="Настройки"
                pathname={pathname}
                can={can}
                items={SETTINGS_NAV}
                openId={openMenuId}
                onOpen={openMenu}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={closeMenu}
              />
            ) : null}

            {staffGroupVisible ? (
              <StaffMenuDropdown
                id="staff"
                pathname={pathname}
                can={can}
                openId={openMenuId}
                onOpen={openMenu}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={closeMenu}
              />
            ) : null}

            {salaryVisible ? (
              <MenuDropdown
                id="salary"
                label="Зарплата"
                pathname={pathname}
                can={can}
                items={SALARY_NAV}
                openId={openMenuId}
                onOpen={openMenu}
                onScheduleClose={scheduleClose}
                onCancelClose={cancelClose}
                onClose={closeMenu}
              />
            ) : null}
          </nav>

          <div className="bo-topbar-aside">
            {user ? (
              <div className="bo-topbar-user" title={`${user.email} · ${ROLE_LABELS[user.role] ?? user.role}`}>
                <span className="bo-topbar-user-email">{user.email}</span>
                <span className="bo-topbar-user-role">{ROLE_LABELS[user.role] ?? user.role}</span>
              </div>
            ) : loading ? (
              <div className="bo-topbar-user bo-topbar-user-muted">Сессия…</div>
            ) : null}
            <button type="button" className="bo-topbar-logout" onClick={onLogout}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Вне header: иначе backdrop-filter у шапки даёт новый containing block — fixed-панель обрезается по высоте шапки и меню «не видно» */}
      <div
        className={mobileNavOpen ? "bo-mobile-nav-backdrop is-visible" : "bo-mobile-nav-backdrop"}
        aria-hidden={!mobileNavOpen}
        onClick={closeMobileNav}
      />

      <nav
        id="bo-mobile-nav"
        className={mobileNavOpen ? "bo-mobile-drawer is-open" : "bo-mobile-drawer"}
        aria-hidden={!mobileNavOpen}
        aria-label="Меню разделов"
      >
        <div className="bo-mobile-drawer-head">
          <span className="bo-mobile-drawer-title">Разделы</span>
          <button
            type="button"
            className="bo-mobile-drawer-close"
            aria-label="Закрыть меню"
            onClick={closeMobileNav}
          >
            ×
          </button>
        </div>
        <div className="bo-mobile-drawer-scroll">
          {can(DASHBOARD.permission) ? (
            <MobileNavLink
              href={DASHBOARD.href}
              active={isNavActive(pathname, DASHBOARD.href)}
              onNavigate={closeMobileNav}
            >
              {DASHBOARD.label}
            </MobileNavLink>
          ) : null}

          {warehouseMaterialsVisible ? (
            <div className="bo-mobile-nav-section">
              <div className="bo-mobile-nav-section-title">Склад и материалы</div>
              {WAREHOUSE_MATERIALS_NAV.map((item) =>
                can(item.permission) ? (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    active={isNavActive(pathname, item.href)}
                    onNavigate={closeMobileNav}
                  >
                    {item.label}
                  </MobileNavLink>
                ) : null
              )}
            </div>
          ) : null}

          {salesVisible ? (
            <div className="bo-mobile-nav-section">
              <div className="bo-mobile-nav-section-title">Продажи</div>
              {SALES_NAV.map((item) =>
                can(item.permission) ? (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    active={isNavActive(pathname, item.href)}
                    onNavigate={closeMobileNav}
                  >
                    {item.label}
                  </MobileNavLink>
                ) : null
              )}
            </div>
          ) : null}

          {settingsVisible ? (
            <div className="bo-mobile-nav-section">
              <div className="bo-mobile-nav-section-title">Настройки</div>
              {SETTINGS_NAV.map((item) =>
                can(item.permission) ? (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    active={isNavActive(pathname, item.href)}
                    onNavigate={closeMobileNav}
                  >
                    {item.label}
                  </MobileNavLink>
                ) : null
              )}
            </div>
          ) : null}

          {staffGroupVisible ? (
            <div className="bo-mobile-nav-section">
              <div className="bo-mobile-nav-section-title">Персонал</div>
              {STAFF_SUB.map((item) =>
                can(item.permission) ? (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    active={isStaffSubActive(pathname, item.href)}
                    onNavigate={closeMobileNav}
                  >
                    {item.label}
                  </MobileNavLink>
                ) : null
              )}
            </div>
          ) : null}

          {salaryVisible ? (
            <div className="bo-mobile-nav-section">
              <div className="bo-mobile-nav-section-title">Зарплата</div>
              {SALARY_NAV.map((item) =>
                can(item.permission) ? (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    active={isNavActive(pathname, item.href)}
                    onNavigate={closeMobileNav}
                  >
                    {item.label}
                  </MobileNavLink>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      </nav>

      <main className={ordersFullWidth ? "bo-main bo-main--orders-full" : "bo-main"}>{children}</main>
    </div>
  );
}
