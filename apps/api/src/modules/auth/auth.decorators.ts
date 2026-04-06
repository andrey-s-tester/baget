import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
