import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
