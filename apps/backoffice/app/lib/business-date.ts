/**
 * Календарные «сутки» для дашборда и отчётов: одна дата = от 00:00 до 00:00 в заданном IANA-поясе.
 * Без этого на сервере в UTC и в браузере смешиваются дни (видны заказы за 1-е и 2-е одновременно).
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Europe/Chisinau";

export function businessTimeZone(): string {
  if (typeof process !== "undefined" && process.env) {
    return (
      process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE ||
      process.env.BUSINESS_TIMEZONE ||
      DEFAULT_BUSINESS_TIMEZONE
    );
  }
  return DEFAULT_BUSINESS_TIMEZONE;
}

/** YYYY-MM-DD — календарная дата момента в часовом поясе бизнеса. */
export function calendarDateKeyInBusinessZone(isoOrDate: string | Date, timeZone = businessTimeZone()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone });
}

export function todayCalendarKeyInBusinessZone(timeZone = businessTimeZone()): string {
  return calendarDateKeyInBusinessZone(new Date(), timeZone);
}

/** YYYY-MM для фильтра «по месяцу» в том же поясе. */
export function calendarMonthKeyInBusinessZone(isoOrDate: string | Date, timeZone = businessTimeZone()): string {
  return calendarDateKeyInBusinessZone(isoOrDate, timeZone).slice(0, 7);
}
