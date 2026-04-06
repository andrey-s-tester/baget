import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, Max, Min, ValidateNested } from "class-validator";

export class MatboardLayerPriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marginMm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerM2!: number;
}

export class FrameLayerPriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profileWidthMm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerMeter!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(2)
  wasteCoeff?: number;
}

export class CalculatePriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(5000)
  widthMm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(5000)
  heightMm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  framePricePerMeter!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(2)
  frameWasteCoeff!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrameLayerPriceDto)
  frameLayers?: FrameLayerPriceDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  frameProfileWidthMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  matboardMarginMm?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatboardLayerPriceDto)
  matboardLayers?: MatboardLayerPriceDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  matboardPricePerM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  glassPricePerM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  backingPricePerM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  assemblyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rushFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimalOrderPrice?: number;
}
