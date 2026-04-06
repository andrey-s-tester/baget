import type { UserRole } from "@prisma/client";

/** Backoffice roles that appear in the permissions matrix (excludes customer). */
export const MATRIX_ROLES: UserRole[] = [
  "owner",
  "admin",
  "manager",
  "worker",
  "seller",
  "dealer",
  "master"
];

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export const PERMISSION_DEFINITIONS = [
  { key: "dashboard", label: "Дашборд", group: "Общее" },
  { key: "catalog_frames", label: "Каталог багета", group: "Склад и материалы" },
  { key: "catalog_matboard", label: "Каталог паспарту", group: "Склад и материалы" },
  { key: "warehouse", label: "Склад — поступления", group: "Склад и материалы" },
  { key: "reports_sales", label: "Отчёт по продажам", group: "Склад и материалы" },
  { key: "reports_receipts", label: "Отчёт по поступлениям", group: "Склад и материалы" },
  { key: "reports_movements", label: "Движения склада", group: "Склад и материалы" },
  { key: "materials", label: "Материалы", group: "Склад и материалы" },
  { key: "pricing", label: "Цены и расчёт", group: "Настройки" },
  { key: "orders", label: "Заказы", group: "Продажи" },
  { key: "products", label: "Товары (готовые картины)", group: "Склад и материалы" },
  { key: "customers", label: "Покупатели", group: "Продажи" },
  { key: "stores", label: "Магазины", group: "Настройки" },
  { key: "staff_employees", label: "Сотрудники — карточки и доступы", group: "Персонал" },
  { key: "staff_discounts", label: "Акции и промо", group: "Настройки" },
  { key: "staff_analytics", label: "Аналитика (устар.)", group: "Общее" },
  { key: "app_releases", label: "Версии и релизы", group: "Настройки" },
  { key: "salary_payroll", label: "Зарплаты", group: "Зарплата" },
  { key: "salary_algorithm", label: "Алгоритм расчёта зарплаты", group: "Зарплата" },
  { key: "role_permissions", label: "Матрица прав ролей", group: "Администрирование" }
] as const;

const ALL_KEYS = PERMISSION_DEFINITIONS.map((d) => d.key);

export function allPermissionsTrue(): Record<string, boolean> {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, true]));
}

/** Defaults when DB has no rows yet. Owner = all; admin ≈ all; manager = ops; narrow roles below. */
export function defaultAllowedForRole(role: UserRole): Record<string, boolean> {
  const all = allPermissionsTrue();
  if (role === "owner") return { ...all };

  if (role === "admin") {
    return { ...all };
  }

  if (role === "manager") {
    return {
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, false])),
      dashboard: true,
      catalog_frames: true,
      catalog_matboard: true,
      warehouse: true,
      reports_sales: true,
      reports_receipts: true,
      reports_movements: true,
      materials: true,
      pricing: true,
      orders: true,
      products: true,
      customers: true,
      stores: true,
      staff_employees: true,
      staff_discounts: true,
      staff_analytics: true,
      app_releases: false,
      salary_payroll: true,
      salary_algorithm: true,
      role_permissions: false
    };
  }

  if (role === "seller") {
    return {
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, false])),
      dashboard: true,
      orders: true,
      products: true,
      customers: true,
      salary_payroll: true,
      salary_algorithm: false
    };
  }

  if (role === "dealer") {
    return {
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, false])),
      dashboard: true,
      orders: true,
      products: true,
      customers: true,
      pricing: true,
      stores: true
    };
  }

  if (role === "master") {
    return {
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, false])),
      dashboard: true,
      catalog_frames: true,
      catalog_matboard: true,
      warehouse: true,
      reports_receipts: true,
      reports_movements: true,
      materials: true,
      orders: true,
      products: true,
      salary_payroll: true,
      salary_algorithm: false
    };
  }

  // worker
  return {
    ...Object.fromEntries(ALL_KEYS.map((k) => [k, false])),
    dashboard: true,
    catalog_frames: true,
    catalog_matboard: true,
    warehouse: false,
    reports_sales: false,
    reports_receipts: false,
    reports_movements: false,
    orders: true,
    products: true,
    staff_employees: false,
    staff_discounts: false,
    staff_analytics: false,
    app_releases: false,
    salary_payroll: false,
    salary_algorithm: false,
    role_permissions: false
  };
}
