/**
 * Разбор остатков из API (число, строка, Prisma Decimal в JSON).
 */
export function parseStockMeters(value: unknown): number {
  return parseFiniteNumber(value);
}

export function parseStockM2(value: unknown): number {
  return parseFiniteNumber(value);
}

/** После JSON.parse остатки могут прийти строкой — приводим к числу на клиенте. */
type FrameRow = { stockMeters?: unknown; minStockMeters?: unknown; stock_meters?: unknown; min_stock_meters?: unknown };

export function normalizeFrameCatalogItems<T extends FrameRow>(items: T[]): T[] {
  return items.map((item) => {
    const sm = item.stockMeters ?? item.stock_meters;
    const minS = item.minStockMeters ?? item.min_stock_meters;
    return {
      ...item,
      stockMeters: parseStockMeters(sm),
      minStockMeters: minS == null ? null : parseStockMeters(minS),
    };
  }) as T[];
}

export function normalizeMatboardCatalogItems<T extends { stockM2?: unknown; minStockM2?: unknown }>(
  items: T[]
): T[] {
  return items.map((item) => ({
    ...item,
    stockM2: parseStockM2(item.stockM2),
    minStockM2: item.minStockM2 == null ? null : parseStockM2(item.minStockM2),
  })) as T[];
}

function parseFiniteNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value.trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "object" && value !== null) {
    const o = value as { toNumber?: () => number; toString?: () => string };
    if (typeof o.toNumber === "function") {
      try {
        const n = o.toNumber();
        return Number.isFinite(n) ? n : 0;
      } catch {
        /* fall through */
      }
    }
    if (typeof o.toString === "function") {
      const n = parseFloat(o.toString().replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }
  }
  const n = Number(value as unknown);
  return Number.isFinite(n) ? n : 0;
}
