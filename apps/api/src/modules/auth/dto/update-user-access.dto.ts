import { UserRole } from "@prisma/client";
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateUserAccessDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
