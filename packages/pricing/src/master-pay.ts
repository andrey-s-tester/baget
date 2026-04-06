/**
 * Расчёт начисления мастеру по одной операции.
 *
 * Формула: **ЗП мастера = (тариф × объём) × (доля_мастера / 100) × K**
 *
 * - **тариф** — цена услуги для клиента за единицу (руб/м.п., руб/м², руб/шт);
 * - **объём** — погонные метры, площадь в м² или количество единиц;
 * - **доля_мастера** — обычно 25–45% от выручки по этой операции (чистая работа);
 * - **K** — повышающий коэффициент (антиквариат, тяжёлые рамы и т.п.), по умолчанию 1.
 *
 * Выручка по операции для клиента: `тариф × объём` (без K; K только на стороне начисления мастеру).
 */

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

export type MasterPayInput = {
  /** Тариф: руб/м.п., руб/м² или руб/шт */
  pricePerUnit: number;
  /** Объём: м, м² или шт (неотрицательное число) */
  quantity: number;
  /** Доля мастера, % (0–100) */
  masterSharePercent: number;
  /**
   * Повышающий коэффициент K (неотрицательный). Умножается на начисление мастеру.
   * @default 1
   */
  complexityMultiplier?: number;
};

export type MasterPayResult = {
  /** Сумма, которую платит клиент за эту операцию (тариф × объём) */
  clientRevenue: number;
  /** Начисление мастеру за операцию */
  masterPay: number;
};

export function calculateMasterPay(input: MasterPayInput): MasterPayResult {
  const price = Math.max(0, Number(input.pricePerUnit) || 0);
  const qty = Math.max(0, Number(input.quantity) || 0);
  const share = clampPercent(Number(input.masterSharePercent));
  const k = Math.max(0, input.complexityMultiplier ?? 1);

  const clientRevenue = roundMoney(price * qty);
  const masterPay = roundMoney(clientRevenue * (share / 100) * k);

  return { clientRevenue, masterPay };
}

/**
 * Зарплата мастера за период: фикс + доля от суммы «сборки» по заказам (руб) × (доля/100) × K.
 */
export function calculateMasterPeriodSalary(input: {
  assemblyTotalRub: number;
  baseAmount: number;
  masterSharePercent: number;
  complexityMultiplier?: number;
}): { assemblyPool: number; masterPayFromAssembly: number; totalSalary: number } {
  const line = calculateMasterPay({
    pricePerUnit: 1,
    quantity: Math.max(0, Number(input.assemblyTotalRub) || 0),
    masterSharePercent: input.masterSharePercent,
    complexityMultiplier: input.complexityMultiplier
  });
  const base = Math.max(0, Number(input.baseAmount) || 0);
  return {
    assemblyPool: line.clientRevenue,
    masterPayFromAssembly: line.masterPay,
    totalSalary: roundMoney(base + line.masterPay)
  };
}

/** Периметр прямоугольника в метрах (для расчёта м.п. сборки по сторонам в мм). */
export function rectanglePerimeterMeters(widthMm: number, heightMm: number): number {
  const w = Math.max(0, widthMm);
  const h = Math.max(0, heightMm);
  return (2 * (w + h)) / 1000;
}

/** Площадь прямоугольника в м² (стороны в мм). */
export function rectangleAreaM2(widthMm: number, heightMm: number): number {
  const w = Math.max(0, widthMm);
  const h = Math.max(0, heightMm);
  return (w * h) / 1_000_000;
}
