import { IsBoolean, IsEnum, IsString } from "class-validator";
import { UserRole } from "@prisma/client";

export class UpdateRolePermissionDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  key!: string;

  @IsBoolean()
  allowed!: boolean;
}
