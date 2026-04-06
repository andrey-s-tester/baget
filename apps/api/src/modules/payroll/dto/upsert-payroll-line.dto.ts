import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UpsertPayrollLineDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}
