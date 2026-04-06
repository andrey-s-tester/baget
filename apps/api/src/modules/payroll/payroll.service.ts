import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateMasterAlgorithmDto } from "./dto/update-master-algorithm.dto";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
// salarySellerAlgorithm model существует в Prisma client runtime, но из-за проблем генерации
// TypeScript типов мы обращаемся к нему через `as any`.

const MANAGE_ROLES: UserRole[] = [UserRole.owner, UserRole.admin, UserRole.manager];

function isManageRole(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role);
}

function parseDay(iso: string): Date {
  const d = new Date(`${iso.trim()}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException("Некорректная дата");
  }
  return d;
}

function moneyStr(v: Prisma.Decimal | null | undefined): string {
  if (v == null) return "0.00";
  return Number(v).toFixed(2);
}

type SellerRuleRow = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  baseAmount: number; // руб
  percent: number; // %
};

type FrameAssemblyRevenueSource = "perimeter_tariff" | "order_assembly_then_frame";
type CanvasStretchRevenueSource = "area_tariff" | "order_canvas" | `order_material:${string}`;
type GlassRevenueSource = "unit_tariff" | "order_glass";
type BackingRevenueSource = "unit_tariff" | "order_backing";
type MatCutRevenueSource = "unit_tariff" | "order_matboard";

type MasterRuleRow = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  /** master | worker — оба участвуют в начислении за сборку */
  accountRole: string;
  baseAmount: number;
  masterSharePercent: number;
  complexityMultiplier: number;
  frameAssemblyRatePerMeter: number;
  frameAssemblyPayMode: "percent" | "fixed";
  frameAssemblySharePercent: number;
  /** Пул по сборке рамы: периметр×тариф или строки чека (сборка из правил, иначе багет) */
  frameAssemblyRevenueSource: FrameAssemblyRevenueSource;
  canvasStretchRatePerM2: number;
  canvasStretchPayMode: "percent" | "fixed";
  canvasStretchSharePercent: number;
  canvasStretchRevenueSource: CanvasStretchRevenueSource;
  glassCutRatePerUnit: number;
  glassInstallRatePerUnit: number;
  glassPayMode: "percent" | "fixed";
  glassSharePercent: number;
  glassRevenueSource: GlassRevenueSource;
  backingCutRatePerUnit: number;
  backingInstallRatePerUnit: number;
  backingPayMode: "percent" | "fixed";
  backingSharePercent: number;
  backingRevenueSource: BackingRevenueSource;
  matCutRatePerUnit: number;
  matPayMode: "percent" | "fixed";
  matSharePercent: number;
  matCutRevenueSource: MatCutRevenueSource;
  /** Участвует ли мастер в операции (иначе выручка и начисление по строке = 0) */
  doesFrameAssembly: boolean;
  doesCanvasStretch: boolean;
  doesGlass: boolean;
  doesBacking: boolean;
  doesMatCut: boolean;
};

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

function payMode(v: unknown): "percent" | "fixed" {
  return String(v) === "fixed" ? "fixed" : "percent";
}

function frameAssemblyRevenueSource(v: unknown): FrameAssemblyRevenueSource {
  return String(v) === "order_assembly_then_frame" ? "order_assembly_then_frame" : "perimeter_tariff";
}

function canvasStretchRevenueSource(v: unknown): CanvasStretchRevenueSource {
  const s = String(v);
  if (s.startsWith("order_material:")) return s as CanvasStretchRevenueSource;
  return s === "order_canvas" || s === "order_backing" ? "order_canvas" : "area_tariff";
}

function parseOrderMaterialBinding(source: string): { kind: string; ref: string } | null {
  if (!source.startsWith("order_material:")) return null;
  const parts = source.split(":");
  if (parts.length < 3) return null;
  const kind = (parts[1] ?? "").trim();
  const ref = parts.slice(2).join(":").trim();
  if (!kind || !ref) return null;
  return { kind, ref };
}

function glassRevenueSource(v: unknown): GlassRevenueSource {
  return String(v) === "order_glass" ? "order_glass" : "unit_tariff";
}

function backingRevenueSource(v: unknown): BackingRevenueSource {
  return String(v) === "order_backing" ? "order_backing" : "unit_tariff";
}

function matCutRevenueSource(v: unknown): MatCutRevenueSource {
  return String(v) === "order_matboard" ? "order_matboard" : "unit_tariff";
}

/** Строки чека из breakdownJson (сохраняются при создании заказа из конструктора/бэкофиса) */
function readOrderPriceLines(j: Record<string, unknown>): {
  frame: number;
  matboard: number;
  glass: number;
  backing: number;
  assembly: number;
} {
  return {
    frame: Math.max(0, Number(j.frame) || 0),
    matboard: Math.max(0, Number(j.matboard) || 0),
    glass: Math.max(0, Number(j.glass) || 0),
    backing: Math.max(0, Number(j.backing) || 0),
    assembly: Math.max(0, Number(j.assembly) || 0)
  };
}

function rectanglePerimeterMeters(widthMm: number, heightMm: number): number {
  const w = Math.max(0, Number(widthMm) || 0);
  const h = Math.max(0, Number(heightMm) || 0);
  return (2 * (w + h)) / 1000;
}

function rectangleAreaM2(widthMm: number, heightMm: number): number {
  const w = Math.max(0, Number(widthMm) || 0);
  const h = Math.max(0, Number(heightMm) || 0);
  return (w * h) / 1_000_000;
}

/** Ключи операций для разбивки пула работ и начисления в отчётах */
export type MasterPayrollOpKey = "frameAssembly" | "canvasStretch" | "glass" | "backing" | "matCut";

const MASTER_OP_KEYS: MasterPayrollOpKey[] = [
  "frameAssembly",
  "canvasStretch",
  "glass",
  "backing",
  "matCut"
];

function emptyMasterOpBreakdown(): Record<MasterPayrollOpKey, number> {
  return {
    frameAssembly: 0,
    canvasStretch: 0,
    glass: 0,
    backing: 0,
    matCut: 0
  };
}

/** Агрегат по мастеру за период: пул работ, переменная часть и разбивка по услугам */
export type MasterAssemblyAgg = {
  workRevenue: number;
  variablePay: number;
  poolByLine: Record<MasterPayrollOpKey, number>;
  payByLine: Record<MasterPayrollOpKey, number>;
};

function emptyMasterAssemblyAgg(): MasterAssemblyAgg {
  return {
    workRevenue: 0,
    variablePay: 0,
    poolByLine: emptyMasterOpBreakdown(),
    payByLine: emptyMasterOpBreakdown()
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

/** Из заказа: что выбрано как задник (тип или id из справочника) */
function orderBackingRawFromJson(j: Record<string, unknown>): string {
  return String(j.backingType ?? j.backingId ?? "").trim();
}

/**
 * Натяжка холста в ЗП: услуга «canvasStretch» (руб/м² × площадь заказа).
 * Срабатывает, если в заказе задник — натяжка/подрамник: литералы stretch|stretcher в JSON
 * или id/code строки справочника BackingType с code stretch|stretcher (заказы с cuid в backingId).
 */
function orderHasCanvasStretch(
  j: Record<string, unknown>,
  canvasBackingKeys: ReadonlySet<string>
): boolean {
  if (j.isCanvas === true) return true;
  const raw = orderBackingRawFromJson(j);
  if (!raw || raw === "none") return false;
  if (raw === "stretch" || raw === "stretcher") return true;
  return canvasBackingKeys.has(raw);
}

/** Обычный задник (картон и т.д.) — не натяжка и не подрамник из canvas-типов */
function orderHasRegularBacking(
  j: Record<string, unknown>,
  canvasBackingKeys: ReadonlySet<string>
): boolean {
  const raw = orderBackingRawFromJson(j);
  if (!raw || raw === "none") return false;
  if (orderHasCanvasStretch(j, canvasBackingKeys)) return false;
  return true;
}

/** Суммы по строкам сходятся с total: последняя операция забирает копейки округления */
function splitPoolByLines(
  byOpsRevenue: number,
  frameRevenue: number,
  canvasRevenue: number,
  glassRevenue: number,
  backingRevenue: number,
  matRevenue: number,
  scale: number
): Record<MasterPayrollOpKey, number> {
  const poolRaw = [
    frameRevenue * scale,
    canvasRevenue * scale,
    glassRevenue * scale,
    backingRevenue * scale,
    matRevenue * scale
  ];
  const out = emptyMasterOpBreakdown();
  let acc = 0;
  for (let i = 0; i < MASTER_OP_KEYS.length - 1; i++) {
    const v = roundMoney(poolRaw[i]);
    out[MASTER_OP_KEYS[i]] = v;
    acc += v;
  }
  out[MASTER_OP_KEYS[MASTER_OP_KEYS.length - 1]] = roundMoney(byOpsRevenue - acc);
  return out;
}

/** Расчёт по одному заказу: пул работ, переменная часть и разбивка по услугам (с учётом потолка по сумме заказа) */
function orderOperationMasterPayFull(input: {
  breakdownJson: unknown;
  orderTotalRub: number;
  rule: MasterRuleRow;
  /** id и code задников в БД, которые считаются натяжкой/подрамником (см. orderHasCanvasStretch) */
  canvasBackingKeys: ReadonlySet<string>;
}): {
  workRevenue: number;
  variablePay: number;
  poolByLine: Record<MasterPayrollOpKey, number>;
  payByLine: Record<MasterPayrollOpKey, number>;
} {
  const zero = (): ReturnType<typeof orderOperationMasterPayFull> => ({
    workRevenue: 0,
    variablePay: 0,
    poolByLine: emptyMasterOpBreakdown(),
    payByLine: emptyMasterOpBreakdown()
  });

  const j = (input.breakdownJson && typeof input.breakdownJson === "object"
    ? (input.breakdownJson as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const widthMm = Number(j.widthMm) || 0;
  const heightMm = Number(j.heightMm) || 0;
  const perimeter = rectanglePerimeterMeters(widthMm, heightMm);
  const area = rectangleAreaM2(widthMm, heightMm);

  const canvasKeys = input.canvasBackingKeys;
  const hasCanvas = orderHasCanvasStretch(j, canvasKeys);
  const glassType = String(j.glassType ?? j.glassId ?? "");
  const hasGlass = glassType.length > 0 && glassType !== "none";
  const hasBacking = orderHasRegularBacking(j, canvasKeys);
  const matLayers = Array.isArray(j.matboardLayers) ? j.matboardLayers.length : 0;
  const hasMat = matLayers > 0 || j.withMatboard === true || j.useMatboard === true || !!j.selectedMatboardSku;
  const matWindows = hasMat ? Math.max(1, matLayers || 1) : 0;

  const lines = readOrderPriceLines(j);
  const r = input.rule;

  const frameRevenueTariff =
    r.doesFrameAssembly !== false ? Math.max(0, r.frameAssemblyRatePerMeter) * perimeter : 0;
  const canvasRevenueTariff =
    r.doesCanvasStretch !== false && hasCanvas ? Math.max(0, r.canvasStretchRatePerM2) * area : 0;
  const glassRevenueTariff =
    r.doesGlass !== false && hasGlass
      ? Math.max(0, r.glassCutRatePerUnit) + Math.max(0, r.glassInstallRatePerUnit)
      : 0;
  const backingRevenueTariff =
    r.doesBacking !== false && hasBacking
      ? Math.max(0, r.backingCutRatePerUnit) + Math.max(0, r.backingInstallRatePerUnit)
      : 0;
  const matRevenueTariff =
    r.doesMatCut !== false && matWindows > 0 ? Math.max(0, r.matCutRatePerUnit) * matWindows : 0;

  let frameRevenue = frameRevenueTariff;
  if (r.doesFrameAssembly !== false && r.frameAssemblyRevenueSource === "order_assembly_then_frame") {
    const fromOrder = lines.assembly > 0 ? lines.assembly : lines.frame;
    if (fromOrder > 0) frameRevenue = fromOrder;
  }

  let canvasRevenue = canvasRevenueTariff;
  if (r.doesCanvasStretch !== false && hasCanvas) {
    if (r.canvasStretchRevenueSource === "order_canvas") {
      if (lines.backing > 0) canvasRevenue = lines.backing;
    } else {
      const mat = parseOrderMaterialBinding(r.canvasStretchRevenueSource);
      // Натяжка привязана к выбранному материалу. Для этой операции релевантен backingId/backingType заказа.
      if (mat && mat.kind === "backing") {
        const rawBacking = orderBackingRawFromJson(j);
        if (rawBacking === mat.ref && lines.backing > 0) {
          canvasRevenue = lines.backing;
        }
      }
    }
  }

  let glassRevenue = glassRevenueTariff;
  if (r.doesGlass !== false && hasGlass && r.glassRevenueSource === "order_glass") {
    if (lines.glass > 0) glassRevenue = lines.glass;
  }

  let backingRevenue = backingRevenueTariff;
  if (r.doesBacking !== false && hasBacking && r.backingRevenueSource === "order_backing") {
    if (lines.backing > 0) backingRevenue = lines.backing;
  }

  let matRevenue = matRevenueTariff;
  if (r.doesMatCut !== false && matWindows > 0 && r.matCutRevenueSource === "order_matboard") {
    if (lines.matboard > 0) matRevenue = lines.matboard;
  }

  const byOpsRevenueRaw = frameRevenue + canvasRevenue + glassRevenue + backingRevenue + matRevenue;
  const orderCap = Math.max(0, Number(input.orderTotalRub) || 0);
  const byOpsRevenue = orderCap > 0 ? Math.min(byOpsRevenueRaw, orderCap) : byOpsRevenueRaw;
  const scale = byOpsRevenueRaw > 0 ? byOpsRevenue / byOpsRevenueRaw : 0;

  const poolByLine = splitPoolByLines(
    byOpsRevenue,
    frameRevenue,
    canvasRevenue,
    glassRevenue,
    backingRevenue,
    matRevenue,
    scale
  );

  const framePay =
    r.doesFrameAssembly === false
      ? 0
      : r.frameAssemblyPayMode === "fixed"
        ? Math.max(0, r.frameAssemblySharePercent) * perimeter
        : frameRevenue * (clampPercent(r.frameAssemblySharePercent) / 100);
  const canvasPay =
    r.doesCanvasStretch === false
      ? 0
      : r.canvasStretchPayMode === "fixed"
        ? Math.max(0, r.canvasStretchSharePercent) * area
        : canvasRevenue * (clampPercent(r.canvasStretchSharePercent) / 100);
  const glassUnits = hasGlass ? 1 : 0;
  const glassPay =
    r.doesGlass === false
      ? 0
      : r.glassPayMode === "fixed"
        ? Math.max(0, r.glassSharePercent) * glassUnits
        : glassRevenue * (clampPercent(r.glassSharePercent) / 100);
  const backingUnits = hasBacking ? 1 : 0;
  const backingPay =
    r.doesBacking === false
      ? 0
      : r.backingPayMode === "fixed"
        ? Math.max(0, r.backingSharePercent) * backingUnits
        : backingRevenue * (clampPercent(r.backingSharePercent) / 100);
  const matPay =
    r.doesMatCut === false
      ? 0
      : r.matPayMode === "fixed"
        ? Math.max(0, r.matSharePercent) * matWindows
        : matRevenue * (clampPercent(r.matSharePercent) / 100);

  const payRaw: Record<MasterPayrollOpKey, number> = {
    frameAssembly: roundMoney(framePay),
    canvasStretch: roundMoney(canvasPay),
    glass: roundMoney(glassPay),
    backing: roundMoney(backingPay),
    matCut: roundMoney(matPay)
  };

  const byOpsPay = payRaw.frameAssembly + payRaw.canvasStretch + payRaw.glass + payRaw.backing + payRaw.matCut;

  if (byOpsRevenue <= 0 && byOpsPay <= 0) {
    return zero();
  }

  let variablePay = roundMoney(byOpsPay);
  let payByLine: Record<MasterPayrollOpKey, number>;

  if (byOpsRevenue > 0 && variablePay === 0) {
    variablePay = roundMoney(byOpsRevenue * (clampPercent(input.rule.masterSharePercent) / 100));
    payByLine = emptyMasterOpBreakdown();
    if (byOpsRevenue > 0 && variablePay > 0) {
      let acc = 0;
      for (let i = 0; i < MASTER_OP_KEYS.length; i++) {
        const key = MASTER_OP_KEYS[i];
        const isLast = i === MASTER_OP_KEYS.length - 1;
        if (isLast) {
          payByLine[key] = roundMoney(variablePay - acc);
        } else {
          const part = roundMoney((variablePay * poolByLine[key]) / byOpsRevenue);
          payByLine[key] = part;
          acc += part;
        }
      }
    } else {
      payByLine = emptyMasterOpBreakdown();
    }
  } else {
    payByLine = emptyMasterOpBreakdown();
    let payAcc = 0;
    for (let i = 0; i < MASTER_OP_KEYS.length - 1; i++) {
      const key = MASTER_OP_KEYS[i];
      payByLine[key] = payRaw[key];
      payAcc += payByLine[key];
    }
    payByLine[MASTER_OP_KEYS[MASTER_OP_KEYS.length - 1]] = roundMoney(variablePay - payAcc);
  }

  return {
    workRevenue: roundMoney(byOpsRevenue),
    variablePay,
    poolByLine,
    payByLine
  };
}

function orderOperationMasterPay(input: {
  breakdownJson: unknown;
  orderTotalRub: number;
  rule: MasterRuleRow;
}): { workRevenue: number; variablePay: number } {
  const x = orderOperationMasterPayFull({ ...input, canvasBackingKeys: EMPTY_STRING_SET });
  return { workRevenue: x.workRevenue, variablePay: x.variablePay };
}

/** Строки отчёта: пул работ по тарифам, начисление до K и вклад в ЗП (× K); флаг — участвует ли услуга в алгоритме мастера */
function masterAssemblyBreakdownRows(
  agg: MasterAssemblyAgg,
  complexityMultiplier: number,
  rule: MasterRuleRow
): Array<{
  code: MasterPayrollOpKey;
  poolRub: number;
  variablePayRub: number;
  variableInSalaryRub: number;
  enabledInAlgorithm: boolean;
}> {
  const K = Math.max(0, complexityMultiplier || 1);
  const enabledByCode: Record<MasterPayrollOpKey, boolean> = {
    frameAssembly: rule.doesFrameAssembly,
    canvasStretch: rule.doesCanvasStretch,
    glass: rule.doesGlass,
    backing: rule.doesBacking,
    matCut: rule.doesMatCut
  };
  return MASTER_OP_KEYS.map((code) => ({
    code,
    poolRub: roundMoney(agg.poolByLine[code]),
    variablePayRub: roundMoney(agg.payByLine[code]),
    variableInSalaryRub: roundMoney(agg.payByLine[code] * K),
    enabledInAlgorithm: enabledByCode[code]
  }));
}

function toDateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function endOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureSellerAlgorithmsExist() {
    // Ленивая инициализация: для всех User.role='seller' создаём запись,
    // если она отсутствует.
    const sellers = await this.prisma.user.findMany({
      where: { role: "seller" },
      select: { id: true }
    });

    const salaryAlgo = (this.prisma as any).salarySellerAlgorithm as {
      findMany: Function;
      create: Function;
    };

    const existing = await salaryAlgo.findMany({
      select: { userId: true }
    });
    const existingSet = new Set((existing ?? []).map((e: any) => e.userId));

    for (const s of sellers) {
      if (existingSet.has(s.id)) continue;
      await salaryAlgo.create({
        data: {
          id: randomUUID(),
          userId: s.id,
          baseAmount: new Prisma.Decimal(1000),
          percent: new Prisma.Decimal(0),
          createdAt: new Date(),
          // В БД у updatedAt нет default, а @updatedAt может не проставляться на create.
          // Явно фиксируем, чтобы не падать с 23502.
          updatedAt: new Date()
        }
      });
    }
  }

  private async getSellerAlgorithms(requester: { id: string; role: UserRole }) {
    await this.ensureSellerAlgorithmsExist();
    const isManage = isManageRole(requester.role);

    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        email: string;
        name: string | null;
        storeId: string | null;
        storeName: string | null;
        baseAmount: unknown;
        percent: unknown;
      }>
    >(
      isManage
        ? Prisma.sql`
            SELECT a."userId"  AS "userId",
                   u."email"    AS "email",
                   u."name"     AS "name",
                   e."storeId"  AS "storeId",
                   s."name"     AS "storeName",
                   a."baseAmount" AS "baseAmount",
                   a."percent"    AS "percent"
            FROM "SalarySellerAlgorithm" a
            JOIN "User" u ON u."id" = a."userId"
            LEFT JOIN "Employee" e ON e."userId" = u."id"
            LEFT JOIN "Store" s ON s."id" = e."storeId"
            WHERE u."role" = 'seller'
            ORDER BY s."name" NULLS LAST, u."email" ASC;
          `
        : Prisma.sql`
            SELECT a."userId"  AS "userId",
                   u."email"    AS "email",
                   u."name"     AS "name",
                   e."storeId"  AS "storeId",
                   s."name"     AS "storeName",
                   a."baseAmount" AS "baseAmount",
                   a."percent"    AS "percent"
            FROM "SalarySellerAlgorithm" a
            JOIN "User" u ON u."id" = a."userId"
            LEFT JOIN "Employee" e ON e."userId" = u."id"
            LEFT JOIN "Store" s ON s."id" = e."storeId"
            WHERE u."role" = 'seller'
              AND u."id" = ${requester.id};
          `
    );

    return rows.map(
      (r) =>
        ({
          userId: r.userId,
          email: r.email,
          name: r.name,
          storeId: r.storeId,
          storeName: r.storeName,
          baseAmount: toNum(r.baseAmount),
          percent: toNum(r.percent)
        }) satisfies SellerRuleRow
    );
  }

  private async ensureMasterAlgorithmsExist() {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.master, UserRole.worker] } },
      select: { id: true }
    });

    for (const { id } of staff) {
      await this.prisma.salaryMasterAlgorithm.upsert({
        where: { userId: id },
        create: {
          userId: id,
          baseAmount: new Prisma.Decimal(0),
          masterSharePercent: new Prisma.Decimal(30),
          complexityMultiplier: new Prisma.Decimal(1)
        },
        update: {}
      });
    }
  }

  private async getMasterAlgorithms(requester: { id: string; role: UserRole }): Promise<MasterRuleRow[]> {
    await this.ensureMasterAlgorithmsExist();
    const isManage = isManageRole(requester.role);
    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        email: string;
        name: string | null;
        storeId: string | null;
        storeName: string | null;
        accountRole: string;
        baseAmount: unknown;
        masterSharePercent: unknown;
        complexityMultiplier: unknown;
        frameAssemblyRatePerMeter: unknown;
        frameAssemblyPayMode: unknown;
        frameAssemblySharePercent: unknown;
        canvasStretchRatePerM2: unknown;
        canvasStretchPayMode: unknown;
        canvasStretchSharePercent: unknown;
        glassCutRatePerUnit: unknown;
        glassInstallRatePerUnit: unknown;
        glassPayMode: unknown;
        glassSharePercent: unknown;
        backingCutRatePerUnit: unknown;
        backingInstallRatePerUnit: unknown;
        backingPayMode: unknown;
        backingSharePercent: unknown;
        matCutRatePerUnit: unknown;
        matPayMode: unknown;
        matSharePercent: unknown;
        doesFrameAssembly: unknown;
        doesCanvasStretch: unknown;
        doesGlass: unknown;
        doesBacking: unknown;
        doesMatCut: unknown;
        frameAssemblyRevenueSource: unknown;
        canvasStretchRevenueSource: unknown;
        glassRevenueSource: unknown;
        backingRevenueSource: unknown;
        matCutRevenueSource: unknown;
      }>
    >(
      isManage
        ? Prisma.sql`
            SELECT a."userId" AS "userId",
                   u."email" AS "email",
                   u."name" AS "name",
                   e."storeId" AS "storeId",
                   s."name" AS "storeName",
                   u."role"::text AS "accountRole",
                   a."baseAmount" AS "baseAmount",
                   a."masterSharePercent" AS "masterSharePercent",
                   a."complexityMultiplier" AS "complexityMultiplier",
                   a."frameAssemblyRatePerMeter" AS "frameAssemblyRatePerMeter",
                   a."frameAssemblyPayMode" AS "frameAssemblyPayMode",
                   a."frameAssemblySharePercent" AS "frameAssemblySharePercent",
                   a."frameAssemblyRevenueSource" AS "frameAssemblyRevenueSource",
                   a."canvasStretchRatePerM2" AS "canvasStretchRatePerM2",
                   a."canvasStretchPayMode" AS "canvasStretchPayMode",
                   a."canvasStretchSharePercent" AS "canvasStretchSharePercent",
                   a."canvasStretchRevenueSource" AS "canvasStretchRevenueSource",
                   a."glassCutRatePerUnit" AS "glassCutRatePerUnit",
                   a."glassInstallRatePerUnit" AS "glassInstallRatePerUnit",
                   a."glassPayMode" AS "glassPayMode",
                   a."glassSharePercent" AS "glassSharePercent",
                   a."glassRevenueSource" AS "glassRevenueSource",
                   a."backingCutRatePerUnit" AS "backingCutRatePerUnit",
                   a."backingInstallRatePerUnit" AS "backingInstallRatePerUnit",
                   a."backingPayMode" AS "backingPayMode",
                   a."backingSharePercent" AS "backingSharePercent",
                   a."backingRevenueSource" AS "backingRevenueSource",
                   a."matCutRatePerUnit" AS "matCutRatePerUnit",
                   a."matPayMode" AS "matPayMode",
                   a."matSharePercent" AS "matSharePercent",
                   a."matCutRevenueSource" AS "matCutRevenueSource",
                   a."doesFrameAssembly" AS "doesFrameAssembly",
                   a."doesCanvasStretch" AS "doesCanvasStretch",
                   a."doesGlass" AS "doesGlass",
                   a."doesBacking" AS "doesBacking",
                   a."doesMatCut" AS "doesMatCut"
            FROM "SalaryMasterAlgorithm" a
            JOIN "User" u ON u."id" = a."userId"
            LEFT JOIN "Employee" e ON e."userId" = u."id"
            LEFT JOIN "Store" s ON s."id" = e."storeId"
            WHERE u."role" IN ('master', 'worker')
            ORDER BY s."name" NULLS LAST, u."email" ASC;
          `
        : Prisma.sql`
            SELECT a."userId" AS "userId",
                   u."email" AS "email",
                   u."name" AS "name",
                   e."storeId" AS "storeId",
                   s."name" AS "storeName",
                   u."role"::text AS "accountRole",
                   a."baseAmount" AS "baseAmount",
                   a."masterSharePercent" AS "masterSharePercent",
                   a."complexityMultiplier" AS "complexityMultiplier",
                   a."frameAssemblyRatePerMeter" AS "frameAssemblyRatePerMeter",
                   a."frameAssemblyPayMode" AS "frameAssemblyPayMode",
                   a."frameAssemblySharePercent" AS "frameAssemblySharePercent",
                   a."frameAssemblyRevenueSource" AS "frameAssemblyRevenueSource",
                   a."canvasStretchRatePerM2" AS "canvasStretchRatePerM2",
                   a."canvasStretchPayMode" AS "canvasStretchPayMode",
                   a."canvasStretchSharePercent" AS "canvasStretchSharePercent",
                   a."canvasStretchRevenueSource" AS "canvasStretchRevenueSource",
                   a."glassCutRatePerUnit" AS "glassCutRatePerUnit",
                   a."glassInstallRatePerUnit" AS "glassInstallRatePerUnit",
                   a."glassPayMode" AS "glassPayMode",
                   a."glassSharePercent" AS "glassSharePercent",
                   a."glassRevenueSource" AS "glassRevenueSource",
                   a."backingCutRatePerUnit" AS "backingCutRatePerUnit",
                   a."backingInstallRatePerUnit" AS "backingInstallRatePerUnit",
                   a."backingPayMode" AS "backingPayMode",
                   a."backingSharePercent" AS "backingSharePercent",
                   a."backingRevenueSource" AS "backingRevenueSource",
                   a."matCutRatePerUnit" AS "matCutRatePerUnit",
                   a."matPayMode" AS "matPayMode",
                   a."matSharePercent" AS "matSharePercent",
                   a."matCutRevenueSource" AS "matCutRevenueSource",
                   a."doesFrameAssembly" AS "doesFrameAssembly",
                   a."doesCanvasStretch" AS "doesCanvasStretch",
                   a."doesGlass" AS "doesGlass",
                   a."doesBacking" AS "doesBacking",
                   a."doesMatCut" AS "doesMatCut"
            FROM "SalaryMasterAlgorithm" a
            JOIN "User" u ON u."id" = a."userId"
            LEFT JOIN "Employee" e ON e."userId" = u."id"
            LEFT JOIN "Store" s ON s."id" = e."storeId"
            WHERE u."role" IN ('master', 'worker')
              AND u."id" = ${requester.id};
          `
    );

    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      storeId: r.storeId,
      storeName: r.storeName,
      accountRole: r.accountRole,
      baseAmount: toNum(r.baseAmount),
      masterSharePercent: toNum(r.masterSharePercent),
      complexityMultiplier: toNum(r.complexityMultiplier),
      frameAssemblyRatePerMeter: toNum(r.frameAssemblyRatePerMeter),
      frameAssemblyPayMode: payMode(r.frameAssemblyPayMode),
      frameAssemblySharePercent: toNum(r.frameAssemblySharePercent),
      frameAssemblyRevenueSource: frameAssemblyRevenueSource(r.frameAssemblyRevenueSource),
      canvasStretchRatePerM2: toNum(r.canvasStretchRatePerM2),
      canvasStretchPayMode: payMode(r.canvasStretchPayMode),
      canvasStretchSharePercent: toNum(r.canvasStretchSharePercent),
      canvasStretchRevenueSource: canvasStretchRevenueSource(r.canvasStretchRevenueSource),
      glassCutRatePerUnit: toNum(r.glassCutRatePerUnit),
      glassInstallRatePerUnit: toNum(r.glassInstallRatePerUnit),
      glassPayMode: payMode(r.glassPayMode),
      glassSharePercent: toNum(r.glassSharePercent),
      glassRevenueSource: glassRevenueSource(r.glassRevenueSource),
      backingCutRatePerUnit: toNum(r.backingCutRatePerUnit),
      backingInstallRatePerUnit: toNum(r.backingInstallRatePerUnit),
      backingPayMode: payMode(r.backingPayMode),
      backingSharePercent: toNum(r.backingSharePercent),
      backingRevenueSource: backingRevenueSource(r.backingRevenueSource),
      matCutRatePerUnit: toNum(r.matCutRatePerUnit),
      matPayMode: payMode(r.matPayMode),
      matSharePercent: toNum(r.matSharePercent),
      matCutRevenueSource: matCutRevenueSource(r.matCutRevenueSource),
      doesFrameAssembly: r.doesFrameAssembly !== false,
      doesCanvasStretch: r.doesCanvasStretch !== false,
      doesGlass: r.doesGlass !== false,
      doesBacking: r.doesBacking !== false,
      doesMatCut: r.doesMatCut !== false
    }));
  }

  /**
   * В заказе в `backingId` часто лежит cuid из `BackingType`, а не строка "stretch".
   * Для строк с code stretch | stretcher собираем и id, и code — тогда натяжка учитывается в ЗП.
   */
  private async getCanvasBackingKeysSet(): Promise<Set<string>> {
    const rows = await this.prisma.backingType.findMany({
      where: { code: { in: ["stretch", "stretcher"] } },
      select: { id: true, code: true }
    });
    const s = new Set<string>();
    for (const r of rows) {
      s.add(r.id);
      if (r.code) s.add(r.code);
    }
    return s;
  }

  /**
   * Сборка для ЗП мастера/цеха: только заказы в статусе «Готов».
   * Период (как у продавцов по продажам): заказ создан в [dateFrom, dateTo] и статус «Готов».
   * Дополнительно: заказы, у которых в OrderStatusHistory переход в ready попал в тот же интервал
   * (актуально после включения записи истории при смене статуса — заказ мог быть создан раньше).
   */
  private async computeMasterAssemblyByUserId(period: {
    dateFrom: Date;
    dateTo: Date;
  }, rules: MasterRuleRow[]): Promise<Record<string, MasterAssemblyAgg>> {
    const from = new Date(period.dateFrom);
    from.setUTCHours(0, 0, 0, 0);
    const to = endOfDayUtc(period.dateTo);

    const directReady = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.ready,
        createdAt: { gte: from, lte: to }
      },
      select: { id: true }
    });
    const historyReady = await this.prisma.orderStatusHistory.findMany({
      where: {
        status: OrderStatus.ready,
        createdAt: { gte: from, lte: to }
      },
      select: { orderId: true }
    });
    const orderIds = Array.from(
      new Set([
        ...directReady.map((o) => o.id),
        ...historyReady.map((h) => h.orderId)
      ])
    );
    if (orderIds.length === 0) return {};
    const canvasBackingKeys = await this.getCanvasBackingKeysSet();
    const ruleByUserId = new Map(rules.map((r) => [r.userId, r]));

    const normalizeAggTotals = (a: MasterAssemblyAgg) => {
      a.workRevenue = roundMoney(a.workRevenue);
      a.variablePay = roundMoney(a.variablePay);
      let poolAcc = 0;
      for (let i = 0; i < MASTER_OP_KEYS.length - 1; i++) {
        const k = MASTER_OP_KEYS[i];
        a.poolByLine[k] = roundMoney(a.poolByLine[k]);
        poolAcc += a.poolByLine[k];
      }
      a.poolByLine[MASTER_OP_KEYS[MASTER_OP_KEYS.length - 1]] = roundMoney(a.workRevenue - poolAcc);
      let payAcc = 0;
      for (let i = 0; i < MASTER_OP_KEYS.length - 1; i++) {
        const k = MASTER_OP_KEYS[i];
        a.payByLine[k] = roundMoney(a.payByLine[k]);
        payAcc += a.payByLine[k];
      }
      a.payByLine[MASTER_OP_KEYS[MASTER_OP_KEYS.length - 1]] = roundMoney(a.variablePay - payAcc);
    };

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        storeId: true,
        totalSnapshot: true,
        breakdownJson: true,
        tasks: {
          select: {
            employee: {
              select: {
                userId: true
              }
            }
          }
        }
      }
    });

    const activeProdEmployees = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        user: {
          role: { in: [UserRole.master, UserRole.worker] }
        }
      },
      select: {
        storeId: true,
        userId: true
      }
    });

    const globalPoolUsers = Array.from(new Set(activeProdEmployees.map((e) => e.userId)));
    const storePoolUsers = new Map<string, string[]>();
    for (const e of activeProdEmployees) {
      if (!e.storeId) continue;
      const list = storePoolUsers.get(e.storeId) ?? [];
      list.push(e.userId);
      storePoolUsers.set(e.storeId, Array.from(new Set(list)));
    }

    const out: Record<string, MasterAssemblyAgg> = {};
    for (const o of orders) {
      const assignedUserIds = Array.from(
        new Set(
          (o.tasks ?? [])
            .map((t) => t.employee?.userId ?? null)
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
      );

      const poolByStore = o.storeId ? storePoolUsers.get(o.storeId) ?? [] : [];
      const fallbackUsers = poolByStore.length > 0 ? poolByStore : globalPoolUsers;
      const targets = assignedUserIds.length > 0 ? assignedUserIds : fallbackUsers;
      if (targets.length === 0) continue;
      const n = targets.length;
      for (const uid of targets) {
        const rule = ruleByUserId.get(uid);
        if (!rule) continue;
        const op = orderOperationMasterPayFull({
          breakdownJson: o.breakdownJson,
          orderTotalRub: Number(o.totalSnapshot),
          rule,
          canvasBackingKeys
        });
        out[uid] = out[uid] ?? emptyMasterAssemblyAgg();
        const a = out[uid];
        a.workRevenue += op.workRevenue / n;
        a.variablePay += op.variablePay / n;
        for (const key of MASTER_OP_KEYS) {
          a.poolByLine[key] += op.poolByLine[key] / n;
          a.payByLine[key] += op.payByLine[key] / n;
        }
      }
    }
    for (const uid of Object.keys(out)) {
      normalizeAggTotals(out[uid]);
    }
    return out;
  }

  private async computeSalesMapForPeriod(period: {
    dateFrom: Date;
    dateTo: Date;
  }): Promise<Record<string, number>> {
    const from = new Date(period.dateFrom);
    from.setUTCHours(0, 0, 0, 0);
    const to = endOfDayUtc(period.dateTo);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        // Только «Готов»
        status: OrderStatus.ready,
        storeId: { not: null }
      },
      select: { storeId: true, totalSnapshot: true }
    });

    const map: Record<string, number> = {};
    for (const o of orders) {
      const key = o.storeId!;
      map[key] = (map[key] || 0) + Number(o.totalSnapshot);
    }
    return map;
  }

  /**
   * Авторасчёт зарплаты производства за произвольный интервал (те же правила, что ведомость и страница «Алгоритм»).
   */
  async getMasterSalaryReport(
    dateFromStr: string,
    dateToStr: string,
    requester: { id: string; role: UserRole }
  ) {
    const dateFrom = parseDay(dateFromStr);
    const dateTo = parseDay(dateToStr);
    if (!isManageRole(requester.role)) throw new ForbiddenException();
    const rules = await this.getMasterAlgorithms(requester);
    const assemblyByUser = await this.computeMasterAssemblyByUserId({ dateFrom, dateTo }, rules);
    const masters = rules.map((rule) => {
      const agg = assemblyByUser[rule.userId] ?? emptyMasterAssemblyAgg();
      const K = Math.max(0, rule.complexityMultiplier || 1);
      const salary = Math.round((rule.baseAmount + agg.variablePay * K) * 100) / 100;
      return {
        userId: rule.userId,
        email: rule.email,
        name: rule.name,
        storeId: rule.storeId,
        storeName: rule.storeName,
        accountRole: rule.accountRole,
        baseAmount: Math.round(rule.baseAmount * 100) / 100,
        masterSharePercent: Math.round(rule.masterSharePercent * 100) / 100,
        complexityMultiplier: Math.round(rule.complexityMultiplier * 10000) / 10000,
        assemblyTotal: Math.round(agg.workRevenue * 100) / 100,
        salaryTotal: Math.round(salary * 100) / 100,
        assemblyBreakdown: masterAssemblyBreakdownRows(agg, rule.complexityMultiplier, rule)
      };
    });
    return {
      ok: true as const,
      dateFrom: toDateOnlyISO(dateFrom),
      dateTo: toDateOnlyISO(dateTo),
      masters,
      totalAssembly: Math.round(masters.reduce((s, m) => s + m.assemblyTotal, 0) * 100) / 100,
      totalSalary: Math.round(masters.reduce((s, m) => s + m.salaryTotal, 0) * 100) / 100
    };
  }

  async listPeriodSummaries(requester: { id: string; role: UserRole }) {
    const periods = await this.prisma.payrollPeriod.findMany({
      orderBy: { dateFrom: "desc" }
    });

    const sellerRules = await this.getSellerAlgorithms(requester);
    const masterRules = await this.getMasterAlgorithms(requester);
    const isRequesterSeller = requester.role === "seller";
    const isRequesterProd =
      requester.role === UserRole.master || requester.role === UserRole.worker;

    return {
      ok: true as const,
      periods: await Promise.all(
        periods.map(async (p) => {
          const salesByStore = await this.computeSalesMapForPeriod(p);
          const assemblyByUser = await this.computeMasterAssemblyByUserId(p, masterRules);

          let totalAmount = 0;
          let myAmount = 0;

          for (const rule of sellerRules) {
            const sales = rule.storeId ? salesByStore[rule.storeId] || 0 : 0;
            const salary = rule.baseAmount + (sales * rule.percent) / 100;
            totalAmount += salary;
            if (isRequesterSeller && rule.userId === requester.id) {
              myAmount = salary;
            }
          }

          for (const rule of masterRules) {
            const agg = assemblyByUser[rule.userId] ?? emptyMasterAssemblyAgg();
            const totalSalary =
              Math.round((rule.baseAmount + agg.variablePay * Math.max(0, rule.complexityMultiplier || 1)) * 100) /
              100;
            totalAmount += totalSalary;
            if (isRequesterProd && rule.userId === requester.id) {
              myAmount = totalSalary;
            }
          }

          return {
            id: p.id,
            label: p.label,
            dateFrom: toDateOnlyISO(p.dateFrom),
            dateTo: toDateOnlyISO(p.dateTo),
            comment: p.comment,
            sellersCount: sellerRules.length,
            mastersCount: masterRules.length,
            totalAmount: Math.round(totalAmount * 100) / 100,
            myAmount: Math.round(myAmount * 100) / 100,
            updatedAt: p.updatedAt.toISOString()
          };
        })
      )
    };
  }

  async getPeriodDetail(periodId: string, requester: { id: string; role: UserRole }) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId }
    });
    if (!period) throw new NotFoundException("Период не найден");

    const sellerRules = await this.getSellerAlgorithms(requester);
    const masterRules = await this.getMasterAlgorithms(requester);
    const isRequesterSeller = requester.role === "seller";
    const isRequesterProd =
      requester.role === UserRole.master || requester.role === UserRole.worker;
    const salesByStore = await this.computeSalesMapForPeriod(period);
    const assemblyByUser = await this.computeMasterAssemblyByUserId(period, masterRules);

    const issuedLines = await this.prisma.payrollLine.findMany({
      where: {
        periodId,
        ...(isRequesterSeller || isRequesterProd ? { userId: requester.id } : {})
      },
      select: { userId: true, amount: true }
    });
    const issuedByUserId = new Map(issuedLines.map((l) => [l.userId, Number(l.amount)]));

    const sellers = sellerRules
      .map((rule) => {
        const sales = rule.storeId ? salesByStore[rule.storeId] || 0 : 0;
        const salary = rule.baseAmount + (sales * rule.percent) / 100;
        const issuedAmount = issuedByUserId.get(rule.userId) ?? null;
        return {
          userId: rule.userId,
          email: rule.email,
          name: rule.name,
          storeId: rule.storeId,
          storeName: rule.storeName,
          baseAmount: Math.round(rule.baseAmount * 100) / 100,
          percent: Math.round(rule.percent * 100) / 100,
          salesTotal: Math.round(sales * 100) / 100,
          salaryTotal: Math.round(salary * 100) / 100,
          issuedAmount: issuedAmount == null ? null : Math.round(issuedAmount * 100) / 100
        };
      })
      .sort((a, b) => (a.storeName || "").localeCompare(b.storeName || "") || a.email.localeCompare(b.email));

    const masters = masterRules
      .map((rule) => {
        const agg = assemblyByUser[rule.userId] ?? emptyMasterAssemblyAgg();
        const totalSalary =
          Math.round((rule.baseAmount + agg.variablePay * Math.max(0, rule.complexityMultiplier || 1)) * 100) /
          100;
        const issuedAmount = issuedByUserId.get(rule.userId) ?? null;
        return {
          userId: rule.userId,
          email: rule.email,
          name: rule.name,
          storeId: rule.storeId,
          storeName: rule.storeName,
          accountRole: rule.accountRole,
          baseAmount: Math.round(rule.baseAmount * 100) / 100,
          masterSharePercent: Math.round(rule.masterSharePercent * 100) / 100,
          complexityMultiplier: Math.round(rule.complexityMultiplier * 10000) / 10000,
          frameAssemblyRatePerMeter: Math.round(rule.frameAssemblyRatePerMeter * 100) / 100,
          frameAssemblyPayMode: rule.frameAssemblyPayMode,
          frameAssemblySharePercent: Math.round(rule.frameAssemblySharePercent * 100) / 100,
          frameAssemblyRevenueSource: rule.frameAssemblyRevenueSource,
          canvasStretchRatePerM2: Math.round(rule.canvasStretchRatePerM2 * 100) / 100,
          canvasStretchPayMode: rule.canvasStretchPayMode,
          canvasStretchSharePercent: Math.round(rule.canvasStretchSharePercent * 100) / 100,
          canvasStretchRevenueSource: rule.canvasStretchRevenueSource,
          glassCutRatePerUnit: Math.round(rule.glassCutRatePerUnit * 100) / 100,
          glassInstallRatePerUnit: Math.round(rule.glassInstallRatePerUnit * 100) / 100,
          glassPayMode: rule.glassPayMode,
          glassSharePercent: Math.round(rule.glassSharePercent * 100) / 100,
          glassRevenueSource: rule.glassRevenueSource,
          backingCutRatePerUnit: Math.round(rule.backingCutRatePerUnit * 100) / 100,
          backingInstallRatePerUnit: Math.round(rule.backingInstallRatePerUnit * 100) / 100,
          backingPayMode: rule.backingPayMode,
          backingSharePercent: Math.round(rule.backingSharePercent * 100) / 100,
          backingRevenueSource: rule.backingRevenueSource,
          matCutRatePerUnit: Math.round(rule.matCutRatePerUnit * 100) / 100,
          matPayMode: rule.matPayMode,
          matSharePercent: Math.round(rule.matSharePercent * 100) / 100,
          matCutRevenueSource: rule.matCutRevenueSource,
          assemblyTotal: Math.round(agg.workRevenue * 100) / 100,
          salaryTotal: Math.round(totalSalary * 100) / 100,
          issuedAmount: issuedAmount == null ? null : Math.round(issuedAmount * 100) / 100,
          assemblyBreakdown: masterAssemblyBreakdownRows(agg, rule.complexityMultiplier, rule)
        };
      })
      .sort((a, b) => (a.storeName || "").localeCompare(b.storeName || "") || a.email.localeCompare(b.email));

    const mySalarySeller = isRequesterSeller
      ? sellers.find((s) => s.userId === requester.id)?.salaryTotal ?? 0
      : 0;
    const mySalaryMaster = isRequesterProd
      ? masters.find((m) => m.userId === requester.id)?.salaryTotal ?? 0
      : 0;
    const mySalary = mySalarySeller + mySalaryMaster;

    const myIssued =
      (isRequesterSeller || isRequesterProd) && issuedByUserId.has(requester.id);

    return {
      ok: true as const,
      period: {
        id: period.id,
        label: period.label,
        dateFrom: toDateOnlyISO(period.dateFrom),
        dateTo: toDateOnlyISO(period.dateTo),
        comment: period.comment,
        updatedAt: period.updatedAt.toISOString(),
        sellers,
        masters,
        mySalary,
        myIssued
      }
    };
  }

  async upsertPeriodLines(periodId: string, body: unknown, requester: { id: string; role: UserRole }) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId }
    });
    if (!period) throw new NotFoundException("Период не найден");

    const sellerRules = await this.getSellerAlgorithms(requester);
    const masterRules = await this.getMasterAlgorithms(requester);
    const isRequesterSeller = requester.role === "seller";
    const isRequesterProd =
      requester.role === UserRole.master || requester.role === UserRole.worker;
    const salesByStore = await this.computeSalesMapForPeriod(period);
    const assemblyByUser = await this.computeMasterAssemblyByUserId(period, masterRules);

    // Optional override format:
    // - body is array: [{ userId, amount?, note? }]
    // - body is object: { lines: [{...}] , note?: string }
    const parseOverrides = (): Array<{ userId: string; amount?: unknown; note?: unknown }> | null => {
      if (Array.isArray(body)) return body as any;
      if (body && typeof body === "object" && Array.isArray((body as any).lines)) return (body as any).lines;
      return null;
    };
    const globalNote =
      body && typeof body === "object" && "note" in body ? (body as any).note ?? null : null;

    const overrides = parseOverrides();
    const overrideByUserId = new Map<string, { amount?: unknown; note?: unknown }>();
    if (overrides) {
      for (const o of overrides) {
        if (!o || typeof o !== "object") continue;
        const userId = (o as any).userId;
        if (typeof userId !== "string" || userId.length < 1) continue;
        overrideByUserId.set(userId, { amount: (o as any).amount, note: (o as any).note });
      }
    }

    const upserted = [];

    for (const rule of sellerRules) {
      if (isRequesterProd) continue;
      // For seller role, getSellerAlgorithms returns only that seller's row, so this is just a safety belt.
      if (isRequesterSeller && rule.userId !== requester.id) continue;

      const sales = rule.storeId ? salesByStore[rule.storeId] || 0 : 0;
      const computedAmount = rule.baseAmount + (sales * rule.percent) / 100;
      const computedRounded = Math.round(computedAmount * 100) / 100;

      const override = overrideByUserId.get(rule.userId);
      const overrideAmountRaw = override?.amount;
      const overrideAmount = overrideAmountRaw == null ? undefined : Number(overrideAmountRaw);

      const amountFinal =
        overrideAmount != null && Number.isFinite(overrideAmount) ? overrideAmount : computedRounded;
      if (!Number.isFinite(amountFinal) || amountFinal < 0) {
        throw new BadRequestException("amount некорректен (>= 0)");
      }

      const noteFinal =
        (override?.note == null ? undefined : String(override.note)) ??
        (globalNote == null ? null : String(globalNote)) ??
        null;

      const row = await this.prisma.payrollLine.upsert({
        where: { payroll_line_period_user: { periodId, userId: rule.userId } },
        update: {
          amount: new Prisma.Decimal(amountFinal),
          note: noteFinal
        },
        create: {
          periodId,
          userId: rule.userId,
          amount: new Prisma.Decimal(amountFinal),
          note: noteFinal
        }
      });

      upserted.push({
        id: row.id,
        userId: row.userId,
        amount: Number(row.amount)
      });
    }

    for (const rule of masterRules) {
      if (isRequesterSeller) continue;
      if (isRequesterProd && rule.userId !== requester.id) continue;

      const agg = assemblyByUser[rule.userId] ?? emptyMasterAssemblyAgg();
      const totalSalary =
        Math.round((rule.baseAmount + agg.variablePay * Math.max(0, rule.complexityMultiplier || 1)) * 100) /
        100;
      const computedRounded = Math.round(totalSalary * 100) / 100;

      const override = overrideByUserId.get(rule.userId);
      const overrideAmountRaw = override?.amount;
      const overrideAmount = overrideAmountRaw == null ? undefined : Number(overrideAmountRaw);

      const amountFinal =
        overrideAmount != null && Number.isFinite(overrideAmount) ? overrideAmount : computedRounded;
      if (!Number.isFinite(amountFinal) || amountFinal < 0) {
        throw new BadRequestException("amount некорректен (>= 0)");
      }

      const noteFinal =
        (override?.note == null ? undefined : String(override.note)) ??
        (globalNote == null ? null : String(globalNote)) ??
        null;

      const row = await this.prisma.payrollLine.upsert({
        where: { payroll_line_period_user: { periodId, userId: rule.userId } },
        update: {
          amount: new Prisma.Decimal(amountFinal),
          note: noteFinal
        },
        create: {
          periodId,
          userId: rule.userId,
          amount: new Prisma.Decimal(amountFinal),
          note: noteFinal
        }
      });

      upserted.push({
        id: row.id,
        userId: row.userId,
        amount: Number(row.amount)
      });
    }

    return {
      ok: true as const,
      lines: upserted
    };
  }

  async deletePeriodLine(periodId: string, lineId: string, requester: { id: string; role: UserRole }) {
    const line = await this.prisma.payrollLine.findUnique({
      where: { id: lineId },
      select: { id: true, periodId: true, userId: true }
    });
    if (!line || line.periodId !== periodId) throw new NotFoundException("Строка не найдена");

    if (requester.role === "seller" && line.userId !== requester.id) {
      throw new ForbiddenException("Нет прав на удаление");
    }
    if (
      (requester.role === UserRole.master || requester.role === UserRole.worker) &&
      line.userId !== requester.id
    ) {
      throw new ForbiddenException("Нет прав на удаление");
    }

    await this.prisma.payrollLine.delete({ where: { id: lineId } });
    return { ok: true as const };
  }

  async createPeriod(
    body: { label: string; dateFrom: string; dateTo: string; comment?: string },
    requester: { role: UserRole }
  ) {
    if (!isManageRole(requester.role)) throw new ForbiddenException();
    const from = parseDay(body.dateFrom);
    const to = parseDay(body.dateTo);
    if (from > to) throw new BadRequestException("dateFrom не может быть позже dateTo");

    const row = await this.prisma.payrollPeriod.create({
      data: {
        label: body.label.trim(),
        dateFrom: from,
        dateTo: to,
        comment: body.comment?.trim() || null
      }
    });
    return {
      ok: true as const,
      period: {
        id: row.id,
        label: row.label,
        dateFrom: row.dateFrom.toISOString().slice(0, 10),
        dateTo: row.dateTo.toISOString().slice(0, 10),
        comment: row.comment
      }
    };
  }

  async updatePeriod(
    periodId: string,
    body: { label?: string; dateFrom?: string; dateTo?: string; comment?: string | null },
    requester: { role: UserRole }
  ) {
    if (!isManageRole(requester.role)) throw new ForbiddenException();
    const existing = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!existing) throw new NotFoundException("Период не найден");

    let dateFrom = existing.dateFrom;
    let dateTo = existing.dateTo;
    if (body.dateFrom !== undefined) dateFrom = parseDay(body.dateFrom);
    if (body.dateTo !== undefined) dateTo = parseDay(body.dateTo);
    if (dateFrom > dateTo) throw new BadRequestException("dateFrom не может быть позже dateTo");

    const row = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        ...(body.label !== undefined ? { label: body.label.trim() } : {}),
        dateFrom,
        dateTo,
        ...(body.comment !== undefined ? { comment: body.comment?.trim() || null } : {})
      }
    });
    return {
      ok: true as const,
      period: {
        id: row.id,
        label: row.label,
        dateFrom: row.dateFrom.toISOString().slice(0, 10),
        dateTo: row.dateTo.toISOString().slice(0, 10),
        comment: row.comment
      }
    };
  }

  async deletePeriod(periodId: string, requester: { role: UserRole }) {
    if (requester.role !== UserRole.owner && requester.role !== UserRole.admin) {
      throw new ForbiddenException();
    }
    try {
      await this.prisma.payrollPeriod.delete({ where: { id: periodId } });
    } catch {
      throw new NotFoundException("Период не найден");
    }
    return { ok: true as const };
  }

  async listSellerAlgorithms(requester: { id: string; role: UserRole }) {
    // requester.role != seller тоже может смотреть для проверки (manage).
    if (requester.role !== "seller" && !isManageRole(requester.role)) {
      throw new ForbiddenException();
    }
    return {
      ok: true as const,
      sellers: await this.getSellerAlgorithms(requester)
    };
  }

  async updateSellerAlgorithm(
    userId: string,
    body: { baseAmount: number; percent: number },
    requester: { id: string; role: UserRole }
  ) {
    if (!isManageRole(requester.role) && requester.id !== userId) {
      throw new ForbiddenException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });
    if (!user) throw new NotFoundException("Пользователь не найден");
    if (user.role !== "seller") throw new BadRequestException("Можно настроить только продавца");

    const baseAmount = Number(body.baseAmount);
    const percent = Number(body.percent);
    if (!Number.isFinite(baseAmount) || baseAmount < 0) throw new BadRequestException("baseAmount некорректен");
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new BadRequestException("percent некорректен (0..100)");

    // Через Prisma, чтобы гарантировать корректную установку updatedAt (@updatedAt)
    // NOTE: Из-за возможных рассинхронов схемы/миграций в БД `upsert` может упасть
    // на ON CONFLICT, если уникальный индекс по `userId` в Postgres не существует.
    // Поэтому делаем "findFirst -> update/create" без ON CONFLICT.
    const salaryAlgo = (this.prisma as any).salarySellerAlgorithm as {
      findFirst: Function;
      update: Function;
      create: Function;
    };

    const existing = await salaryAlgo.findFirst({
      where: { userId }
    });

    const updateData = {
      baseAmount: new Prisma.Decimal(baseAmount),
      percent: new Prisma.Decimal(percent),
      updatedAt: new Date()
    };

    if (existing?.id) {
      await salaryAlgo.update({
        where: { id: existing.id },
        data: updateData
      });
    } else {
      await salaryAlgo.create({
        data: {
          // Некоторые окружения/схемы могли создать таблицу без DEFAULT для id.
          // Чтобы не получать 23502 (not-null) — задаём id явно.
          id: randomUUID(),
          userId,
          baseAmount: updateData.baseAmount,
          percent: updateData.percent,
          createdAt: new Date(),
          updatedAt: updateData.updatedAt
        }
      });
    }

    return {
      ok: true as const
    };
  }

  async listMasterAlgorithms(requester: { id: string; role: UserRole }) {
    if (requester.role !== UserRole.master && requester.role !== UserRole.worker && !isManageRole(requester.role)) {
      throw new ForbiddenException();
    }
    return {
      ok: true as const,
      masters: await this.getMasterAlgorithms(requester)
    };
  }

  async updateMasterAlgorithm(
    userId: string,
    body: UpdateMasterAlgorithmDto,
    requester: { id: string; role: UserRole }
  ) {
    if (!isManageRole(requester.role) && requester.id !== userId) {
      throw new ForbiddenException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });
    if (!user) throw new NotFoundException("Пользователь не найден");
    if (user.role !== UserRole.master && user.role !== UserRole.worker) {
      throw new BadRequestException("Можно настроить только мастера/цех");
    }
    const existingAlgo = await (this.prisma as any).salaryMasterAlgorithm.findUnique({
      where: { userId },
      select: {
        doesFrameAssembly: true,
        doesCanvasStretch: true,
        doesGlass: true,
        doesBacking: true,
        doesMatCut: true,
        frameAssemblyRevenueSource: true,
        canvasStretchRevenueSource: true,
        glassRevenueSource: true,
        backingRevenueSource: true,
        matCutRevenueSource: true
      }
    });
    const baseAmount = Number(body.baseAmount);
    const masterSharePercent = Number(body.masterSharePercent);
    const complexityMultiplier = Number(body.complexityMultiplier);
    if (!Number.isFinite(baseAmount) || baseAmount < 0) throw new BadRequestException("baseAmount некорректен");
    if (!Number.isFinite(masterSharePercent) || masterSharePercent < 0 || masterSharePercent > 100) {
      throw new BadRequestException("masterSharePercent некорректен (0..100)");
    }
    if (!Number.isFinite(complexityMultiplier) || complexityMultiplier < 0) {
      throw new BadRequestException("complexityMultiplier некорректен (>= 0)");
    }
    const frameAssemblyRatePerMeter = Math.max(0, Number(body.frameAssemblyRatePerMeter ?? 0) || 0);
    const frameAssemblyPayMode = payMode(body.frameAssemblyPayMode);
    const frameAssemblySharePercent = clampPercent(Number(body.frameAssemblySharePercent ?? 30));
    const canvasStretchRatePerM2 = Math.max(0, Number(body.canvasStretchRatePerM2 ?? 0) || 0);
    const canvasStretchPayMode = payMode(body.canvasStretchPayMode);
    const canvasStretchSharePercent = clampPercent(Number(body.canvasStretchSharePercent ?? 30));
    const glassCutRatePerUnit = Math.max(0, Number(body.glassCutRatePerUnit ?? 0) || 0);
    const glassInstallRatePerUnit = Math.max(0, Number(body.glassInstallRatePerUnit ?? 0) || 0);
    const glassPayMode = payMode(body.glassPayMode);
    const glassSharePercent = clampPercent(Number(body.glassSharePercent ?? 30));
    const backingCutRatePerUnit = Math.max(0, Number(body.backingCutRatePerUnit ?? 0) || 0);
    const backingInstallRatePerUnit = Math.max(0, Number(body.backingInstallRatePerUnit ?? 0) || 0);
    const backingPayMode = payMode(body.backingPayMode);
    const backingSharePercent = clampPercent(Number(body.backingSharePercent ?? 30));
    const matCutRatePerUnit = Math.max(0, Number(body.matCutRatePerUnit ?? 0) || 0);
    const matPayMode = payMode(body.matPayMode);
    const matSharePercent = clampPercent(Number(body.matSharePercent ?? 30));
    const pickRev = <T>(key: string, parser: (v: unknown) => T, previous: unknown): T =>
      Object.prototype.hasOwnProperty.call(body as object, key)
        ? parser((body as unknown as Record<string, unknown>)[key])
        : parser(previous);
    const frameAssemblyRevSource = pickRev(
      "frameAssemblyRevenueSource",
      frameAssemblyRevenueSource,
      existingAlgo?.frameAssemblyRevenueSource
    );
    const canvasStretchRevSource = pickRev(
      "canvasStretchRevenueSource",
      canvasStretchRevenueSource,
      existingAlgo?.canvasStretchRevenueSource
    );
    const glassRevSource = pickRev("glassRevenueSource", glassRevenueSource, existingAlgo?.glassRevenueSource);
    const backingRevSource = pickRev(
      "backingRevenueSource",
      backingRevenueSource,
      existingAlgo?.backingRevenueSource
    );
    const matCutRevSource = pickRev("matCutRevenueSource", matCutRevenueSource, existingAlgo?.matCutRevenueSource);
    /** Явный false в JSON должен сохраняться; undefined в теле — не затирать текущее значение в БД */
    const readOpFlag = (key: keyof UpdateMasterAlgorithmDto, cur: boolean | undefined): boolean => {
      if (!Object.prototype.hasOwnProperty.call(body as object, key)) {
        return cur !== false;
      }
      const v = (body as unknown as Record<string, unknown>)[key];
      if (v === true || v === false) return v;
      return cur !== false;
    };

    const doesFrameAssembly = readOpFlag("doesFrameAssembly", existingAlgo?.doesFrameAssembly);
    const doesCanvasStretch = readOpFlag("doesCanvasStretch", existingAlgo?.doesCanvasStretch);
    const doesGlass = readOpFlag("doesGlass", existingAlgo?.doesGlass);
    const doesBacking = readOpFlag("doesBacking", existingAlgo?.doesBacking);
    const doesMatCut = readOpFlag("doesMatCut", existingAlgo?.doesMatCut);

    await (this.prisma as any).salaryMasterAlgorithm.upsert({
      where: { userId },
      create: {
        userId,
        baseAmount: new Prisma.Decimal(baseAmount),
        masterSharePercent: new Prisma.Decimal(masterSharePercent),
        complexityMultiplier: new Prisma.Decimal(complexityMultiplier),
        frameAssemblyRatePerMeter: new Prisma.Decimal(frameAssemblyRatePerMeter),
        frameAssemblyPayMode,
        frameAssemblySharePercent: new Prisma.Decimal(frameAssemblySharePercent),
        frameAssemblyRevenueSource: frameAssemblyRevSource,
        canvasStretchRatePerM2: new Prisma.Decimal(canvasStretchRatePerM2),
        canvasStretchPayMode,
        canvasStretchSharePercent: new Prisma.Decimal(canvasStretchSharePercent),
        canvasStretchRevenueSource: canvasStretchRevSource,
        glassCutRatePerUnit: new Prisma.Decimal(glassCutRatePerUnit),
        glassInstallRatePerUnit: new Prisma.Decimal(glassInstallRatePerUnit),
        glassPayMode,
        glassSharePercent: new Prisma.Decimal(glassSharePercent),
        glassRevenueSource: glassRevSource,
        backingCutRatePerUnit: new Prisma.Decimal(backingCutRatePerUnit),
        backingInstallRatePerUnit: new Prisma.Decimal(backingInstallRatePerUnit),
        backingPayMode,
        backingSharePercent: new Prisma.Decimal(backingSharePercent),
        backingRevenueSource: backingRevSource,
        matCutRatePerUnit: new Prisma.Decimal(matCutRatePerUnit),
        matPayMode,
        matSharePercent: new Prisma.Decimal(matSharePercent),
        matCutRevenueSource: matCutRevSource,
        doesFrameAssembly,
        doesCanvasStretch,
        doesGlass,
        doesBacking,
        doesMatCut
      },
      update: {
        baseAmount: new Prisma.Decimal(baseAmount),
        masterSharePercent: new Prisma.Decimal(masterSharePercent),
        complexityMultiplier: new Prisma.Decimal(complexityMultiplier),
        frameAssemblyRatePerMeter: new Prisma.Decimal(frameAssemblyRatePerMeter),
        frameAssemblyPayMode,
        frameAssemblySharePercent: new Prisma.Decimal(frameAssemblySharePercent),
        frameAssemblyRevenueSource: frameAssemblyRevSource,
        canvasStretchRatePerM2: new Prisma.Decimal(canvasStretchRatePerM2),
        canvasStretchPayMode,
        canvasStretchSharePercent: new Prisma.Decimal(canvasStretchSharePercent),
        canvasStretchRevenueSource: canvasStretchRevSource,
        glassCutRatePerUnit: new Prisma.Decimal(glassCutRatePerUnit),
        glassInstallRatePerUnit: new Prisma.Decimal(glassInstallRatePerUnit),
        glassPayMode,
        glassSharePercent: new Prisma.Decimal(glassSharePercent),
        glassRevenueSource: glassRevSource,
        backingCutRatePerUnit: new Prisma.Decimal(backingCutRatePerUnit),
        backingInstallRatePerUnit: new Prisma.Decimal(backingInstallRatePerUnit),
        backingPayMode,
        backingSharePercent: new Prisma.Decimal(backingSharePercent),
        backingRevenueSource: backingRevSource,
        matCutRatePerUnit: new Prisma.Decimal(matCutRatePerUnit),
        matPayMode,
        matSharePercent: new Prisma.Decimal(matSharePercent),
        matCutRevenueSource: matCutRevSource,
        doesFrameAssembly,
        doesCanvasStretch,
        doesGlass,
        doesBacking,
        doesMatCut
      }
    });

    return {
      ok: true as const
    };
  }

  /**
   * История фактических выплат (PayrollLine). У сотрудника — только свои строки;
   * у owner/admin/manager — все или фильтр по userId.
   */
  async getPayoutHistory(
    requester: { id: string; role: UserRole },
    query: { userId?: string; limit?: number }
  ) {
    const limit = Math.min(Math.max(Number(query.limit) || 120, 1), 500);
    let filterUserId: string | undefined;
    if (isManageRole(requester.role)) {
      const u = query.userId?.trim();
      filterUserId = u && u.length > 0 ? u : undefined;
    } else {
      filterUserId = requester.id;
      if (query.userId && query.userId.trim() !== requester.id) {
        throw new ForbiddenException("Можно смотреть только свою историю выплат");
      }
    }

    const lines = await this.prisma.payrollLine.findMany({
      where: filterUserId ? { userId: filterUserId } : {},
      take: limit,
      orderBy: [{ period: { dateFrom: "desc" } }, { createdAt: "desc" }],
      include: {
        period: { select: { id: true, label: true, dateFrom: true, dateTo: true } },
        user: { select: { id: true, email: true, name: true } }
      }
    });

    return {
      ok: true as const,
      lines: lines.map((l) => ({
        id: l.id,
        amount: Math.round(Number(l.amount) * 100) / 100,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
        period: {
          id: l.period.id,
          label: l.period.label,
          dateFrom: toDateOnlyISO(l.period.dateFrom),
          dateTo: toDateOnlyISO(l.period.dateTo)
        },
        user: {
          id: l.user.id,
          email: l.user.email,
          name: l.user.name
        }
      }))
    };
  }

  /** Сводка по выплатам: для админов — по всей базе; для остальных — личная. */
  async getPayoutSummary(requester: { id: string; role: UserRole }) {
    if (isManageRole(requester.role)) {
      const [agg, employees] = await Promise.all([
        this.prisma.payrollLine.aggregate({
          _sum: { amount: true },
          _count: { _all: true }
        }),
        this.prisma.payrollLine.groupBy({
          by: ["userId"],
          _count: { _all: true }
        })
      ]);
      return {
        ok: true as const,
        scope: "all" as const,
        totalPaid: Math.round(Number(agg._sum.amount ?? 0) * 100) / 100,
        payoutCount: agg._count._all,
        employeesWithPayouts: employees.length
      };
    }

    const mine = await this.prisma.payrollLine.aggregate({
      where: { userId: requester.id },
      _sum: { amount: true },
      _count: { _all: true }
    });
    return {
      ok: true as const,
      scope: "me" as const,
      totalPaid: Math.round(Number(mine._sum.amount ?? 0) * 100) / 100,
      payoutCount: mine._count._all
    };
  }
}
