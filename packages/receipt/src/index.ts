const GLASS_LABELS: Record<string, string> = {
  none: "Нет",
  regular: "Обычное",
  matte: "Матовое",
  anti_glare: "Антиблик",
  acrylic: "Пластиковое"
};

const BACKING_LABELS: Record<string, string> = {
  none: "Нет",
  cardboard: "Картон",
  foam5: "Пенокартон 5 мм",
  stretch: "Натяжка вышивки",
  stretcher: "Подрамник"
};

/** Справочник аксессуаров (как в ответе `/api/materials`) — для подстановки названий по id в квитанции и UI. */
export type AccessoryCatalog = {
  hangers?: { id: string; name: string }[];
  subframes?: { id: string; name: string }[];
  assemblyProducts?: { id: string; name: string }[];
  standLegs?: { id: string; name: string }[];
  finishings?: { id: string; name: string }[];
};

function catalogName(list: { id: string; name: string }[] | undefined, id: string): string | undefined {
  const n = list?.find((x) => x.id === id)?.name?.trim();
  return n || undefined;
}

/** Подпись для заказа/квитанции: сохранённое имя, иначе название из справочника, иначе id. */
export function resolveAccessoryDisplay(
  id: unknown,
  savedName: unknown,
  list?: { id: string; name: string }[]
): string {
  const name = String(savedName ?? "").trim();
  if (name) return name;
  const raw = String(id ?? "").trim();
  if (!raw) return "—";
  return catalogName(list, raw) ?? raw;
}

/**
 * Дополняет конфиг полями `*Name`, если их нет, но есть id и совпадение в справочнике.
 * Не мутирует исходный объект.
 */
/** Разбор ответа GET `/api/materials` в `AccessoryCatalog` (для UI и печати). */
export function accessoryCatalogFromMaterialsResponse(raw: unknown): AccessoryCatalog | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const list = (k: string): { id: string; name: string }[] | undefined => {
    const arr = o[k];
    if (!Array.isArray(arr)) return undefined;
    return arr
      .filter((x): x is { id: string; name?: string } => Boolean(x && typeof (x as { id?: string }).id === "string"))
      .map((x) => ({
        id: String((x as { id: string }).id),
        name: String((x as { name?: string }).name ?? (x as { id: string }).id)
      }));
  };
  return {
    hangers: list("hangers"),
    subframes: list("subframes"),
    assemblyProducts: list("assemblyProducts"),
    standLegs: list("standLegs"),
    finishings: list("finishings")
  };
}

export function enrichConfigWithAccessoryCatalog(
  cfg: Record<string, unknown>,
  cat: AccessoryCatalog
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cfg };
  const hid = String(cfg.hangerId ?? "").trim();
  if (hid && !String(cfg.hangerName ?? "").trim()) {
    const n = catalogName(cat.hangers, hid);
    if (n) out.hangerName = n;
  }
  const sid = String(cfg.subframeId ?? "").trim();
  if (sid && !String(cfg.subframeName ?? "").trim()) {
    const n = catalogName(cat.subframes, sid);
    if (n) out.subframeName = n;
  }
  const aid = String(cfg.assemblyProductId ?? "").trim();
  if (aid && !String(cfg.assemblyProductName ?? "").trim()) {
    const n = catalogName(cat.assemblyProducts, aid);
    if (n) out.assemblyProductName = n;
  }
  const lid = String(cfg.standLegId ?? "").trim();
  if (lid && !String(cfg.standLegName ?? "").trim()) {
    const n = catalogName(cat.standLegs, lid);
    if (n) out.standLegName = n;
  }
  const fid = String(cfg.finishingId ?? "").trim();
  if (fid && !String(cfg.finishingName ?? "").trim()) {
    const n = catalogName(cat.finishings, fid);
    if (n) out.finishingName = n;
  }
  return out;
}

export type OrderReceiptInput = {
  /** Внутренний id заказа (cuid); для печати номера см. `orderNumber`. */
  orderId: string;
  /** Публичный номер («1», «2»…); если задан, показывается вместо `orderId`. */
  orderNumber?: string;
  createdAtIso: string;
  customerName: string;
  phone: string;
  email?: string;
  store?: string;
  comment?: string;
  total: number;
  statusLabel?: string;
  priceDetailLine?: string;
  config: Record<string, unknown>;
  /** Если в config нет человекочитаемых имён аксессуаров — подставить по id из справочника. */
  accessoryCatalog?: AccessoryCatalog;
};

function receiptDisplayOrderNo(data: OrderReceiptInput): string {
  return (data.orderNumber && data.orderNumber.trim()) || data.orderId;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numCfg(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Внешние габариты рамы, мм — как в расчёте заказа (паспарту + багет) */
function outerFrameDimensionsMm(cfg: Record<string, unknown>): { w: number; h: number } | null {
  const widthMm = numCfg(cfg.widthMm, 0);
  const heightMm = numCfg(cfg.heightMm, 0);
  if (widthMm <= 0 || heightMm <= 0) return null;

  const rawLayers = cfg.matboardLayers;
  const withMat = cfg.useMatboard === true || cfg.withMatboard === true;
  let outerW = widthMm;
  let outerH = heightMm;

  if (Array.isArray(rawLayers) && rawLayers.length > 0) {
    for (const item of rawLayers) {
      const row = item as Record<string, unknown>;
      const margin = Math.max(0, numCfg(row.marginMm, 20));
      outerW += 2 * margin;
      outerH += 2 * margin;
    }
  } else if (withMat) {
    const margin = numCfg(cfg.matboardWidthMm, 20);
    outerW = widthMm + 2 * margin;
    outerH = heightMm + 2 * margin;
  }

  const rawFrameLayers = cfg.frameLayers;
  if (Array.isArray(rawFrameLayers) && rawFrameLayers.length > 0) {
    let w = outerW;
    let h = outerH;
    for (const item of rawFrameLayers) {
      const row = item as Record<string, unknown>;
      const W = Math.max(0, numCfg(row.profileWidthMm, 0));
      w += 2 * W;
      h += 2 * W;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  const W = numCfg(cfg.frameProfileWidthMm, 0);
  if (W > 0) {
    return { w: Math.round(outerW + 2 * W), h: Math.round(outerH + 2 * W) };
  }
  return { w: Math.round(outerW), h: Math.round(outerH) };
}

/** Снимок в конфиге (`outerWidthMm` / `outerHeightMm`) или расчёт по проёму и слоям. */
function resolveOuterFrameDimensionsMm(cfg: Record<string, unknown>): { w: number; h: number } | null {
  const ow = cfg.outerWidthMm;
  const oh = cfg.outerHeightMm;
  if (ow != null && oh != null) {
    const w = Math.round(Number(ow));
    const h = Math.round(Number(oh));
    if (w > 0 && h > 0) return { w, h };
  }
  return outerFrameDimensionsMm(cfg);
}

/** Внешние габариты готовой рамы (мм) для сохранения в заказе и отображения. */
export function getOrderOuterDimensionsMm(cfg: Record<string, unknown>): { w: number; h: number } | null {
  return resolveOuterFrameDimensionsMm(cfg);
}

/** Строка для квитанции и плана: «420 × 620 мм» или «—». */
export function formatOrderOuterSizeMm(cfg: Record<string, unknown>): string {
  const o = resolveOuterFrameDimensionsMm(cfg);
  if (!o) return "—";
  return `${o.w} × ${o.h} мм`;
}

/** Тип работы для листа в цех: название изделия (`finishingName`), иначе устаревшее поле в конфиге, иначе авто по заднику/изделию. */
export function inferWorkshopWorkType(cfg: Record<string, unknown>): string {
  const fromFinishing = String(cfg.finishingName ?? "").trim();
  if (fromFinishing) return fromFinishing;

  const manual = String(cfg.workshopWorkType ?? cfg.workType ?? "").trim();
  if (manual) return manual;

  const backing = String(cfg.backingId ?? cfg.backingType ?? "").toLowerCase();
  if (backing === "stretch") return "Вышивка";
  if (backing === "stretcher") return "Вышивка (подрамник)";
  if (backing === "cardboard") return "Постер (картон)";
  if (backing === "foam5") return "Постер (пенокартон)";
  const fin = String(cfg.finishingId ?? "").toLowerCase();
  if (fin.includes("mirror") || fin.includes("zerkal")) return "Зеркало";
  return "Фото / постер";
}

/** Количество одинаковых рамок в заказе (по полю `quantity` в конфиге), по умолчанию 1. */
export function orderFrameQuantityFromConfig(cfg: Record<string, unknown>): number {
  if (cfg.showcaseSaleOnly === true) return 1;
  return Math.max(1, Math.min(500, Math.floor(numCfg(cfg.quantity, 1))));
}

function formatOpeningSizePlan(cfg: Record<string, unknown>): string {
  const w = numCfg(cfg.widthMm, 0);
  const h = numCfg(cfg.heightMm, 0);
  if (w <= 0 || h <= 0) return "—";
  return `${w} × ${h}`;
}

function formatFrameSkuPlan(cfg: Record<string, unknown>): string {
  const layers = cfg.frameLayers as { sku?: string }[] | undefined;
  if (Array.isArray(layers) && layers.length > 0) {
    const skus = layers.map((l) => l.sku).filter((s): s is string => Boolean(s && String(s).trim()));
    if (skus.length) return skus.join(" + ");
  }
  const one = cfg.selectedSku;
  return one ? String(one) : "—";
}

function formatGlassPlan(cfg: Record<string, unknown>): string {
  const name = String(cfg.glassName ?? "").trim();
  if (name) return name;
  const id = String(cfg.glassId ?? cfg.glassType ?? "none");
  if (!id || id === "none") return "—";
  return GLASS_LABELS[id] ?? id;
}

function formatBackingPlanShort(cfg: Record<string, unknown>): string {
  const key = String(cfg.backingId ?? cfg.backingType ?? "").trim() || "none";
  if (!key || key === "none") return "—";
  const bn = String(cfg.backingName ?? "").trim();
  if (bn) return bn;
  return BACKING_LABELS[key] ?? key;
}

/** Шаблонные названия из каталога — не дублируем в плане/квитанции, показываем артикул. */
function matboardNameForDisplay(raw: string | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (low === "новое паспарту" || low === "новый паспарту") return "";
  return t;
}

/** Кратко для строки плана цеха: слои паспарту или «—». */
function formatMatboardPlanSummary(cfg: Record<string, unknown>): string {
  const matLayers = cfg.matboardLayers as { sku?: string; marginMm?: number; name?: string }[] | undefined;
  const useMat =
    (matLayers?.length ?? 0) > 0 || cfg.useMatboard === true || cfg.withMatboard === true;
  if (!useMat) return "—";
  if (Array.isArray(matLayers) && matLayers.length > 0) {
    return matLayers
      .map((layer, idx) => {
        const sku = layer.sku || "—";
        const nm = matboardNameForDisplay(String(layer.name ?? ""));
        const core = nm ? `${nm} (${sku})` : sku;
        const m = layer.marginMm != null ? ` · ${Number(layer.marginMm)} мм` : "";
        return `${idx + 1}) ${core}${m}`;
      })
      .join("; ");
  }
  const sel = String(cfg.selectedMatboardSku ?? "").trim();
  if (sel) return sel;
  return "Да";
}

/** Подрамник — отдельная колонка в плане цеха. */
function formatWorkshopPlanSubframe(cfg: Record<string, unknown>): string {
  if (!String(cfg.subframeId ?? "").trim()) return "—";
  return String(cfg.subframeName ?? "").trim() || String(cfg.subframeId);
}

/** Подвес, оформление, ножка — без подрамника (он в отдельной колонке). */
function formatWorkshopPlanExtrasLine(cfg: Record<string, unknown>): string {
  const parts: string[] = [];
  if (String(cfg.hangerId ?? "").trim()) {
    parts.push(`Подвес: ${String(cfg.hangerName ?? "").trim() || String(cfg.hangerId)}`);
  }
  if (String(cfg.assemblyProductId ?? "").trim()) {
    parts.push(`Оформл.: ${String(cfg.assemblyProductName ?? "").trim() || String(cfg.assemblyProductId)}`);
  }
  if (String(cfg.standLegId ?? "").trim()) {
    parts.push(`Ножка: ${String(cfg.standLegName ?? "").trim() || String(cfg.standLegId)}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

/** Имя покупателя для продажи с витрины (розница) — совпадает с проверкой в `isRetailShowcaseOrder`. */
export const SHOWCASE_RETAIL_CUSTOMER_NAME = "Розница";

/** Заказ витрины / «Розница» — не показывать в плане для цеха мастера. */
export function isRetailShowcaseOrder(order: {
  customerName: string;
  config?: Record<string, unknown> | null;
}): boolean {
  const cfg = (order.config ?? {}) as { showcaseSaleOnly?: boolean };
  return (
    order.customerName.trim() === SHOWCASE_RETAIL_CUSTOMER_NAME ||
    cfg.showcaseSaleOnly === true
  );
}

/** Поля строки производственного плана по конфигу (для превью в бэкофисе и печати). */
export function workshopPlanRowFromConfig(cfg: Record<string, unknown>): {
  workType: string;
  openingSizeMm: string;
  outerSizeMm: string;
  frameSku: string;
  glass: string;
  matboard: string;
  backing: string;
  subframe: string;
  extras: string;
  /** Количество одинаковых рамок */
  quantity: string;
} {
  const q = orderFrameQuantityFromConfig(cfg);
  return {
    workType: inferWorkshopWorkType(cfg),
    openingSizeMm: formatOpeningSizePlan(cfg),
    outerSizeMm: formatOrderOuterSizeMm(cfg),
    frameSku: formatFrameSkuPlan(cfg),
    glass: formatGlassPlan(cfg),
    matboard: formatMatboardPlanSummary(cfg),
    backing: formatBackingPlanShort(cfg),
    subframe: formatWorkshopPlanSubframe(cfg),
    extras: formatWorkshopPlanExtrasLine(cfg),
    quantity: String(q)
  };
}

function strCfg(v: unknown): string {
  return String(v ?? "").trim();
}

export function buildReceiptDetailLines(cfg: Record<string, unknown>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if (cfg.showcaseSaleOnly === true) {
    lines.push({ label: "Тип заказа", value: "Продажа с витрины" });
    const desc = strCfg(cfg.showcaseSaleDescription);
    if (desc) lines.push({ label: "Товар", value: desc });
    const soldOnly = cfg.soldShowcaseProducts;
    if (Array.isArray(soldOnly) && soldOnly.length > 0) {
      soldOnly.forEach((item, idx) => {
        const row = item as Record<string, unknown>;
        const title = strCfg(row.title) || "Товар";
        const artist = strCfg(row.artist);
        const size = strCfg(row.sizeLabel);
        const q = Math.max(1, Math.floor(Number(row.qty) || 1));
        const meta = [artist, size].filter(Boolean).join(" · ");
        lines.push({
          label: `Позиция ${idx + 1}`,
          value: `${title}${meta ? ` (${meta})` : ""} · ${q} шт.`
        });
      });
    }
    const promoEarly = strCfg(cfg.promoCode);
    if (promoEarly) lines.push({ label: "Промокод", value: promoEarly });
    return lines;
  }

  const widthMm = cfg.widthMm as number | undefined;
  const heightMm = cfg.heightMm as undefined | number;
  const qty = orderFrameQuantityFromConfig(cfg as Record<string, unknown>);
  if (widthMm && heightMm) {
    lines.push({
      label: "Размер проёма",
      value: `${widthMm} × ${heightMm} мм`
    });
    lines.push({
      label: "Количество рамок",
      value: `${qty} шт.`
    });
    const outer = resolveOuterFrameDimensionsMm(cfg);
    if (outer) {
      lines.push({
        label: "Снаружи",
        value: `${outer.w} × ${outer.h} мм`
      });
    }
  }
  if (cfg.selectedSku) {
    lines.push({ label: "Багет (артикул)", value: `Арт. ${String(cfg.selectedSku)}` });
  }
  const frameLayers = cfg.frameLayers as { sku?: string; profileWidthMm?: number }[] | undefined;
  if (Array.isArray(frameLayers) && frameLayers.length > 0) {
    frameLayers.forEach((layer, idx) => {
      const w = layer.profileWidthMm != null ? ` · ${Number(layer.profileWidthMm)} мм` : "";
      lines.push({ label: `Слой багета ${idx + 1}`, value: `${layer.sku || "—"}${w}` });
    });
  }
  const glassKey = strCfg(cfg.glassId ?? cfg.glassType) || "none";
  const glassLabel = strCfg(cfg.glassName) || GLASS_LABELS[glassKey] || glassKey;
  lines.push({ label: "Стекло", value: glassLabel });

  const backingKey = strCfg(cfg.backingId ?? cfg.backingType) || "none";
  const backingLabel = strCfg(cfg.backingName) || BACKING_LABELS[backingKey] || backingKey;
  lines.push({ label: "Задник", value: backingLabel });

  const matLayers = cfg.matboardLayers as { sku?: string; marginMm?: number; name?: string }[] | undefined;
  const useMat =
    (matLayers?.length ?? 0) > 0 || cfg.useMatboard === true || cfg.withMatboard === true;
  lines.push({ label: "Паспарту", value: useMat ? "Да" : "Нет" });
  if (useMat && Array.isArray(matLayers) && matLayers.length > 0) {
    matLayers.forEach((layer, idx) => {
      const m = layer.marginMm != null ? ` · поле ${Number(layer.marginMm)} мм` : "";
      const nm = matboardNameForDisplay(String(layer.name ?? ""));
      const sku = layer.sku || "—";
      const core = nm ? `${nm} (${sku})` : sku;
      lines.push({ label: `Слой паспарту ${idx + 1}`, value: `${core}${m}` });
    });
  }
  if (cfg.selectedMatboardSku) {
    lines.push({ label: "Паспарту (артикул)", value: String(cfg.selectedMatboardSku) });
  }
  if (cfg.matboardWidthMm != null) {
    lines.push({ label: "Поле паспарту", value: `${Number(cfg.matboardWidthMm)} мм` });
  }

  const hid = strCfg(cfg.hangerId);
  if (hid) lines.push({ label: "Подвес", value: strCfg(cfg.hangerName) || hid });
  const sid = strCfg(cfg.subframeId);
  if (sid) lines.push({ label: "Подрамник", value: strCfg(cfg.subframeName) || sid });
  if (cfg.finishingId) {
    const fn = String(cfg.finishingName ?? "").trim();
    lines.push({ label: "Изделие", value: fn || String(cfg.finishingId) });
  }
  const apid = strCfg(cfg.assemblyProductId);
  if (apid) lines.push({ label: "По оформлению", value: strCfg(cfg.assemblyProductName) || apid });
  const leg = strCfg(cfg.standLegId);
  if (leg) lines.push({ label: "Ножка", value: strCfg(cfg.standLegName) || leg });

  const promo = strCfg(cfg.promoCode);
  if (promo) lines.push({ label: "Промокод", value: promo });

  const sold = cfg.soldShowcaseProducts;
  if (Array.isArray(sold) && sold.length > 0) {
    sold.forEach((item, idx) => {
      const row = item as Record<string, unknown>;
      const title = strCfg(row.title) || "Товар";
      const artist = strCfg(row.artist);
      const size = strCfg(row.sizeLabel);
      const q = Math.max(1, Math.floor(Number(row.qty) || 1));
      const meta = [artist, size].filter(Boolean).join(" · ");
      lines.push({
        label: `Витрина ${idx + 1}`,
        value: `${title}${meta ? ` (${meta})` : ""} · ${q} шт.`
      });
    });
  }

  return lines;
}

export function orderToReceiptInput(
  order: {
    id: string;
    orderNumber?: string;
    createdAt: string;
    status: string;
    customerName: string;
    phone: string;
    email?: string;
    store: string;
    comment?: string;
    total: number;
    config: Record<string, unknown>;
  },
  statusLabel: string,
  options?: { accessoryCatalog?: AccessoryCatalog }
): OrderReceiptInput {
  return {
    orderId: order.id,
    ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
    createdAtIso: order.createdAt,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    store: order.store || undefined,
    comment: order.comment,
    total: Number(order.total),
    statusLabel,
    config: order.config,
    ...(options?.accessoryCatalog ? { accessoryCatalog: options.accessoryCatalog } : {})
  };
}

/** Открывает окно печати. Возвращает false, если браузер заблокировал всплывающее окно. */
export function printOrderReceipt(data: OrderReceiptInput): boolean {
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) return false;

  const displayNo = receiptDisplayOrderNo(data);
  const dateStr = new Date(data.createdAtIso).toLocaleString("ru-RU");
  const cfgForPrint = data.accessoryCatalog
    ? enrichConfigWithAccessoryCatalog(data.config, data.accessoryCatalog)
    : data.config;
  const detailLines = buildReceiptDetailLines(cfgForPrint);

  const rowsToHtml = (lines: { label: string; value: string }[]) =>
    lines.length === 0
      ? ""
      : `<table class="params-table"><tbody>${lines
          .map(
            (l) =>
              `<tr><td class="params-table__k">${escapeHtml(l.label)}</td><td class="params-table__v">${escapeHtml(l.value)}</td></tr>`
          )
          .join("")}</tbody></table>`;

  /** Длинный список параметров — две колонки внутри левой половины листа */
  const paramsSectionHtml =
    detailLines.length === 0
      ? ""
      : detailLines.length < 8
        ? `<div class="params-split params-split--single">${rowsToHtml(detailLines)}</div>`
        : (() => {
            const mid = Math.ceil(detailLines.length / 2);
            return `<div class="params-split">
    <div class="params-split__col">${rowsToHtml(detailLines.slice(0, mid))}</div>
    <div class="params-split__col">${rowsToHtml(detailLines.slice(mid))}</div>
  </div>`;
          })();

  const statusBlock = data.statusLabel
    ? `<div style="margin-top:8px">Статус: <strong>${escapeHtml(data.statusLabel)}</strong></div>`
    : "";

  const clientBlock = `<div class="sheet sheet--client">
    <h1>Квитанция по заказу</h1>
    <div class="brand">Янак · багетная мастерская · <span class="role-tag">клиенту</span></div>
    <div class="section">
      <div class="label">Номер и дата</div>
      <div><strong>№ ${escapeHtml(displayNo)}</strong> · ${escapeHtml(dateStr)}</div>
      ${statusBlock}
    </div>
    <div class="section">
      <div class="label">Клиент</div>
      <table>
        <tr><td style="padding:2px 6px 2px 0;color:#64748b;width:72px;vertical-align:top">Имя</td><td style="padding:2px 0;vertical-align:top">${escapeHtml(data.customerName)}</td></tr>
        <tr><td style="padding:2px 6px 2px 0;color:#64748b;vertical-align:top">Телефон</td><td style="padding:2px 0;vertical-align:top">${escapeHtml(data.phone)}</td></tr>
        ${data.email ? `<tr><td style="padding:2px 6px 2px 0;color:#64748b;vertical-align:top">Email</td><td style="padding:2px 0;vertical-align:top">${escapeHtml(data.email)}</td></tr>` : ""}
        ${data.store ? `<tr><td style="padding:2px 6px 2px 0;color:#64748b;vertical-align:top">Магазин</td><td style="padding:2px 0;vertical-align:top">${escapeHtml(data.store)}</td></tr>` : ""}
      </table>
    </div>
    <div class="section">
      <div class="label">Параметры</div>
      ${paramsSectionHtml}
    </div>
    ${data.comment ? `<div class="section"><div class="label">Комментарий</div><div class="comment">${escapeHtml(data.comment)}</div></div>` : ""}
    <div class="total">Итого к оплате: ${Math.round(data.total).toLocaleString("ru-RU")} руб.</div>
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>Квитанция ${escapeHtml(displayNo)}</title>
  <style>
    /* Альбом A4: слева квитанция, справа пусто под следующий заказ; линия отреза по вертикали посередине */
    @page {
      size: A4 landscape;
      margin: 8mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .a4-split {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      min-height: calc(210mm - 16mm);
      width: 100%;
      max-width: 297mm;
      margin: 0 auto;
    }
    .receipt-half {
      flex: 1 1 50%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
      padding: 1mm 2mm 2mm;
    }
    .receipt-half--blank {
      min-height: 0;
    }
    .tear-off--vertical {
      flex: 0 0 9mm;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2mm 1mm;
      font-size: 7px;
      letter-spacing: 0.04em;
      color: #64748b;
      border-left: 1px dashed #94a3b8;
      border-right: 1px dashed #94a3b8;
      background: #f8fafc;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      line-height: 1.25;
      text-align: center;
    }
    .sheet {
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 8px 10px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .params-split {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: flex-start;
    }
    .params-split--single {
      display: block;
    }
    .params-split--single .params-table {
      width: 100%;
    }
    .params-split__col {
      flex: 1 1 50%;
      min-width: 0;
    }
    .params-split__col .params-table {
      font-size: 9px;
    }
    .params-split__col .params-table td {
      padding: 4px 6px;
    }
    .params-split__col .params-table__k {
      min-width: 0;
    }
    .role-tag {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      background: #e0e7ff;
      color: #3730a3;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    h1 {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 2px;
    }
    .brand {
      color: #64748b;
      font-size: 9.5px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .section { margin-top: 10px; }
    .section:first-of-type { margin-top: 0; }
    .label {
      color: #64748b;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }
    table { width: 100%; border-collapse: collapse; }
    .params-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      border: 1px solid #cbd5e1;
    }
    .params-table td {
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
      vertical-align: top;
    }
    .params-table__k {
      width: 40%;
      min-width: 88px;
      background: #f1f5f9;
      color: #475569;
      font-weight: 600;
    }
    .params-table__v {
      color: #0f172a;
    }
    .total {
      font-size: 13px;
      font-weight: 800;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1.5px solid #94a3b8;
    }
    .comment {
      margin-top: 8px;
      padding: 6px 8px;
      background: #f8fafc;
      border-radius: 4px;
      white-space: pre-wrap;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="a4-split">
    <section class="receipt-half" aria-label="Квитанция клиенту">
      ${clientBlock}
    </section>
    <div class="tear-off--vertical" aria-hidden="true">отрезать · слева — квитанция · справа — под следующий заказ</div>
    <section class="receipt-half receipt-half--blank" aria-label="Под следующий заказ"></section>
  </div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
  return true;
}

/** Печать: производственный план на день — горизонтальный список, один заказ = одна строка. */
export function printMasterDayOrdersReport(args: {
  dayTitle: string;
  /** Дата в шапке, напр. «24.05.2024» */
  dateLabel?: string;
  orders: OrderReceiptInput[];
  hidePrices?: boolean;
}): boolean {
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank", "width=1100,height=720");
  if (!w) return false;

  const hidePrices = args.hidePrices === true;
  const sum = args.orders.reduce((s, o) => s + Math.round(Number(o.total) || 0), 0);
  const dateLabel =
    args.dateLabel?.trim() ||
    (args.orders[0]
      ? new Date(args.orders[0].createdAtIso).toLocaleDateString("ru-RU")
      : new Date().toLocaleDateString("ru-RU"));

  const sorted = [...args.orders].sort(
    (a, b) => new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime()
  );

  const bodyRows = sorted
    .map((data) => {
      const displayNo = receiptDisplayOrderNo(data);
      const cfg = data.accessoryCatalog
        ? enrichConfigWithAccessoryCatalog(data.config, data.accessoryCatalog)
        : data.config;
      const plan = workshopPlanRowFromConfig(cfg);
      const commentShort = data.comment
        ? escapeHtml(data.comment.length > 72 ? `${data.comment.slice(0, 69)}…` : data.comment)
        : "—";
      return `<tr>
  <td class="td-num"><strong>#${escapeHtml(displayNo)}</strong></td>
  <td class="td-qty">${escapeHtml(plan.quantity)}</td>
  <td>${escapeHtml(plan.workType)}</td>
  <td class="td-mono">${escapeHtml(plan.openingSizeMm)}</td>
  <td class="td-outer">${escapeHtml(plan.outerSizeMm)}</td>
  <td class="td-sku">${escapeHtml(plan.frameSku)}</td>
  <td class="td-mat">${escapeHtml(plan.matboard)}</td>
  <td>${escapeHtml(plan.glass)}</td>
  <td class="td-back">${escapeHtml(plan.backing)}</td>
  <td class="td-subframe">${escapeHtml(plan.subframe)}</td>
  <td class="td-extra">${escapeHtml(plan.extras)}</td>
  <td class="td-note">${commentShort}</td>
</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>Производственный план — ${escapeHtml(dateLabel)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 10px;
      line-height: 1.35;
      color: #0f172a;
      margin: 0;
      padding: 0 0 12px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hint {
      color: #64748b;
      font-size: 9px;
      line-height: 1.4;
      margin: 0 0 10px;
      max-width: 100%;
    }
    h1 {
      font-size: 16px;
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .meta {
      color: #475569;
      font-size: 11px;
      margin-bottom: 12px;
    }
    .meta strong { color: #0f172a; }
    table.plan {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9px;
    }
    table.plan thead { display: table-header-group; }
    table.plan th,
    table.plan td {
      border: 1px solid #cbd5e1;
      padding: 6px 7px;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
    }
    table.plan th {
      background: #f1f5f9;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #334155;
    }
    table.plan tbody tr:nth-child(even) { background: #f8fafc; }
    .td-num { width: 6%; white-space: nowrap; }
    .td-qty { width: 4%; font-variant-numeric: tabular-nums; text-align: center; font-weight: 700; }
    .td-mono { font-variant-numeric: tabular-nums; width: 7%; }
    .td-outer { font-variant-numeric: tabular-nums; width: 8%; font-size: 9px; }
    .td-sku { width: 8%; font-size: 9px; }
    .td-mat { width: 14%; font-size: 8.5px; line-height: 1.3; }
    .td-back { width: 6%; font-size: 9px; }
    .td-subframe { width: 8%; font-size: 8.5px; line-height: 1.3; color: #334155; }
    .td-extra { width: 11%; font-size: 8.5px; line-height: 1.3; color: #334155; }
    .td-note { font-size: 9px; color: #334155; width: 14%; }
  </style>
</head>
<body>
  <p class="hint">Каждая строка — один заказ. Колонка <strong>«Подрамник»</strong> — отдельно. В <strong>«Дополнительно»</strong> — подвес, оформление, ножка (изделие см. в «Тип работы»).</p>
  <h1>Производственный план (лист-заказ в цех)</h1>
  <div class="meta">Дата: <strong>${escapeHtml(dateLabel)}</strong> &nbsp;|&nbsp; Заказов: <strong>${args.orders.length}</strong>${hidePrices ? "" : ` &nbsp;|&nbsp; Сумма: <strong>${sum.toLocaleString("ru-RU")} руб.</strong>`}</div>
  <p class="meta" style="margin-top:-6px;margin-bottom:10px;color:#64748b">${escapeHtml(args.dayTitle)}</p>
  <table class="plan">
    <thead>
      <tr>
        <th>№ заказа</th>
        <th>Кол-во</th>
        <th>Тип работы</th>
        <th>Размер (мм)</th>
        <th>Снаружи (мм)</th>
        <th>Багет</th>
        <th>Паспарту</th>
        <th>Стекло</th>
        <th>Задник</th>
        <th>Подрамник</th>
        <th>Дополнительно</th>
        <th>Комментарий</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
  return true;
}
