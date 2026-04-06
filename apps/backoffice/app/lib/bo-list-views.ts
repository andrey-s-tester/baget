/**
 * Ускоренный список заказов для дашборда, отчётов и списка «Покупатели»: без breakdownJson, лимит строк.
 * Детали заказа (размеры и т.д.): GET /api/orders?ids=id1,id2. Полный список — страница «Заказы», модалки.
 */
export const ORDERS_LIST_VIEW = "/api/orders?lite=1&limit=800" as const;

/** Lite-заказы для страницы «Покупатели» (суммы и привязка к orderIds), лимит выше дашборда. */
export const ORDERS_LIST_VIEW_CUSTOMERS = "/api/orders?lite=1&limit=2000" as const;
