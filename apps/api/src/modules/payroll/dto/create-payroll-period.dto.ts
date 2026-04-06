import { IsOptional, IsString, MinLength } from "class-validator";

export class CreatePayrollPeriodDto {
  @IsString()
  @MinLength(1)
  label!: string;

  /** ISO date YYYY-MM-DD */
  @IsString()
  dateFrom!: string;

  /** ISO date YYYY-MM-DD */
  @IsString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
