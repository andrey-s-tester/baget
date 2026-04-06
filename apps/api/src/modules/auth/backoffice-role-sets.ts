import { UserRole } from "@prisma/client";

/** Роли бэкофиса: учётные записи сотрудников и владелец (без customer). */
export const BACKOFFICE_ROLES: UserRole[] = [
  UserRole.owner,
  UserRole.admin,
  UserRole.manager,
  UserRole.worker,
  UserRole.seller,
  UserRole.dealer,
  UserRole.master
];
