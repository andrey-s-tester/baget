import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdatePayrollPeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  comment?: string | null;
}
