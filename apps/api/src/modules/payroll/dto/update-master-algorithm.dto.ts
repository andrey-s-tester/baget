import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";

/** PATCH /payroll/masters/:userId — явные декораторы, чтобы ValidationPipe (whitelist) не отбрасывал поля */
export class UpdateMasterAlgorithmDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  masterSharePercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  complexityMultiplier!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  frameAssemblyRatePerMeter?: number;

  @IsOptional()
  @IsIn(["percent", "fixed"])
  frameAssemblyPayMode?: "percent" | "fixed";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  frameAssemblySharePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  canvasStretchRatePerM2?: number;

  @IsOptional()
  @IsIn(["percent", "fixed"])
  canvasStretchPayMode?: "percent" | "fixed";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  canvasStretchSharePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  glassCutRatePerUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  glassInstallRatePerUnit?: number;

  @IsOptional()
  @IsIn(["percent", "fixed"])
  glassPayMode?: "percent" | "fixed";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  glassSharePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  backingCutRatePerUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  backingInstallRatePerUnit?: number;

  @IsOptional()
  @IsIn(["percent", "fixed"])
  backingPayMode?: "percent" | "fixed";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  backingSharePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  matCutRatePerUnit?: number;

  @IsOptional()
  @IsIn(["percent", "fixed"])
  matPayMode?: "percent" | "fixed";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  matSharePercent?: number;

  @IsOptional()
  @IsBoolean()
  doesFrameAssembly?: boolean;

  @IsOptional()
  @IsBoolean()
  doesCanvasStretch?: boolean;

  @IsOptional()
  @IsBoolean()
  doesGlass?: boolean;

  @IsOptional()
  @IsBoolean()
  doesBacking?: boolean;

  @IsOptional()
  @IsBoolean()
  doesMatCut?: boolean;

  /** Пул ЗП по сборке: perimeter_tariff | order_assembly_then_frame */
  @IsOptional()
  @IsIn(["perimeter_tariff", "order_assembly_then_frame"])
  frameAssemblyRevenueSource?: string;

  @IsOptional()
  @IsString()
  canvasStretchRevenueSource?: string;

  @IsOptional()
  @IsIn(["unit_tariff", "order_glass"])
  glassRevenueSource?: string;

  @IsOptional()
  @IsIn(["unit_tariff", "order_backing"])
  backingRevenueSource?: string;

  @IsOptional()
  @IsIn(["unit_tariff", "order_matboard"])
  matCutRevenueSource?: string;
}
