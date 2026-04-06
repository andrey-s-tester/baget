import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type UserRole } from "@prisma/client";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BACKOFFICE_ROLES } from "./backoffice-role-sets";
import { SESSION_TTL_MS } from "./auth.constants";
import {
  MATRIX_ROLES,
  PERMISSION_DEFINITIONS,
  allPermissionsTrue,
  defaultAllowedForRole,
  type PermissionKey
} from "./permissions.catalog";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
};

type ActiveSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  user: SessionUser;
};

@Injectable()
export class AuthService {
  /** Кэш матрицы прав по роли — /auth/me перестаёт бить Prisma на каждый запрос. */
  private rolePermissionsCache = new Map<UserRole, { expiresAt: number; data: Record<string, boolean> }>();
  private static readonly ROLE_PERM_TTL_MS = 45_000;

  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<SessionUser | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) return null;
      const user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, role: true, name: true, isActive: true, passwordHash: true }
      });
      if (!user || !user.isActive) return null;
      if (!this.verifyPassword(password, user.passwordHash)) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      };
    } catch (error) {
      this.handleDbError(error);
      return null;
    }
  }

  async createSession(userId: string, userAgent?: string, ipAddress?: string) {
    try {
      const token = randomBytes(32).toString("hex");
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await this.prisma.session.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
          userAgent: userAgent || null,
          ipAddress: ipAddress || null
        }
      });
      return { token, expiresAt };
    } catch (error) {
      this.handleDbError(error);
      throw error;
    }
  }

  /**
   * Магазин из карточки сотрудника (Employee.storeId) — для любой роли бэкофиса, не только продавца.
   */
  async getSellerStoreForUser(userId: string): Promise<{ id: string; name: string } | null> {
    try {
      const emp = await this.prisma.employee.findUnique({
        where: { userId },
        select: {
          storeId: true,
          store: { select: { id: true, name: true } }
        }
      });
      if (!emp) return null;
      if (emp.store) return { id: emp.store.id, name: emp.store.name };
      if (emp.storeId) {
        const row = await this.prisma.store.findUnique({
          where: { id: emp.storeId },
          select: { id: true, name: true }
        });
        if (row) return { id: row.id, name: row.name };
      }
      return null;
    } catch (error) {
      this.handleDbError(error);
      return null;
    }
  }

  /** У старых/сидированных учёток могла не быть строки Employee — создаём пустую, чтобы магазин можно было привязать в «Сотрудниках». */
  async ensureBackofficeEmployeeRow(userId: string, role: UserRole): Promise<void> {
    if (!BACKOFFICE_ROLES.includes(role)) return;
    try {
      await this.prisma.employee.upsert({
        where: { userId },
        create: { userId },
        update: {}
      });
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async listAccessUsers() {
    try {
      return await this.prisma.user.findMany({
        where: { role: { in: BACKOFFICE_ROLES } },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          isActive: true,
          createdAt: true,
          employee: {
            select: {
              storeId: true,
              store: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
    } catch (error) {
      this.handleDbError(error);
      throw error;
    }
  }

  async createAccessUser(params: {
    email: string;
    password: string;
    role: UserRole;
    name?: string;
    storeId?: string;
  }) {
    if (!BACKOFFICE_ROLES.includes(params.role)) {
      throw new BadRequestException("Недопустимая роль для учётной записи сотрудника");
    }
    try {
      const normalizedEmail = params.email.trim().toLowerCase();
      const passwordHash = this.hashPassword(params.password);
      const created = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: params.role,
          name: params.name?.trim() || null,
          isActive: true,
          employee: {
            create: {
              storeId: params.storeId?.trim() || null
            }
          }
        },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          isActive: true,
          createdAt: true,
          employee: {
            select: {
              storeId: true,
              store: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });

      // Инициализируем настройки алгоритма, чтобы новый продавец сразу появился в «Алгоритме».
      if (created.role === "seller") {
        // Модель существует в runtime Prisma client, но TypeScript может быть без неё из-за генерации.
        const salaryAlgo = (this.prisma as any).salarySellerAlgorithm as {
          upsert: Function;
        };
        await salaryAlgo.upsert({
          where: { userId: created.id },
          create: {
            userId: created.id,
            baseAmount: new Prisma.Decimal(1000),
            percent: new Prisma.Decimal(0),
            updatedAt: new Date()
          },
          update: {
            baseAmount: new Prisma.Decimal(1000),
            percent: new Prisma.Decimal(0),
            updatedAt: new Date()
          }
        });
      }

      return created;
    } catch (error) {
      this.handleDbError(error);
      throw error;
    }
  }

  async deleteAccessUser(userId: string) {
    try {
      await this.prisma.user.delete({
        where: { id: userId }
      });
      return { ok: true };
    } catch (error) {
      this.handleDbError(error);
      throw error;
    }
  }

  async updateAccessUser(
    userId: string,
    patch: {
      email?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
      name?: string;
      storeId?: string;
    }
  ) {
    try {
      const data: {
        email?: string;
        role?: UserRole;
        isActive?: boolean;
        passwordHash?: string;
        name?: string | null;
      } = {};
      if (patch.email) data.email = patch.email.trim().toLowerCase();
      if (patch.role) {
        if (!BACKOFFICE_ROLES.includes(patch.role)) {
          throw new BadRequestException("Недопустимая роль для учётной записи сотрудника");
        }
        data.role = patch.role;
      }
      if (typeof patch.isActive === "boolean") data.isActive = patch.isActive;
      if (patch.password) data.passwordHash = this.hashPassword(patch.password);
      if (patch.name !== undefined) data.name = patch.name.trim() || null;
      const nextStoreId =
        patch.storeId === undefined ? undefined : patch.storeId.trim() || null;
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data,
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            isActive: true,
            createdAt: true
          }
        });

        if (user.role === "seller") {
          const salaryAlgo = (tx as any).salarySellerAlgorithm as { upsert: Function };
          await salaryAlgo.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              baseAmount: new Prisma.Decimal(1000),
              percent: new Prisma.Decimal(0),
              updatedAt: new Date()
            },
            update: {
              baseAmount: new Prisma.Decimal(1000),
              percent: new Prisma.Decimal(0),
              updatedAt: new Date()
            }
          });
        }
        if (nextStoreId !== undefined) {
          await tx.employee.upsert({
            where: { userId },
            create: { userId, storeId: nextStoreId },
            update: { storeId: nextStoreId }
          });
        }
        return tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            isActive: true,
            createdAt: true,
            employee: {
              select: {
                storeId: true,
                store: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        });
      });
    } catch (error) {
      this.handleDbError(error);
      throw error;
    }
  }

  private isValidPermissionKey(key: string): key is PermissionKey {
    return PERMISSION_DEFINITIONS.some((d) => d.key === key);
  }

  async ensureDefaultRolePermissions() {
    try {
      const existing = await this.prisma.rolePermission.findMany({
        select: { role: true, key: true }
      });
      const have = new Set(existing.map((r) => `${r.role}:${r.key}`));
      const toCreate: { role: UserRole; key: string; allowed: boolean }[] = [];
      for (const role of MATRIX_ROLES) {
        const defaults = defaultAllowedForRole(role);
        for (const def of PERMISSION_DEFINITIONS) {
          if (!have.has(`${role}:${def.key}`)) {
            toCreate.push({
              role,
              key: def.key,
              allowed: Boolean(defaults[def.key])
            });
          }
        }
      }
      if (toCreate.length > 0) {
        await this.prisma.rolePermission.createMany({ data: toCreate });
      }
    } catch (error) {
      this.handleDbError(error);
    }
  }

  /**
   * Effective permissions for session checks. Owner always has full access.
   */
  async getPermissionsForRole(role: UserRole): Promise<Record<string, boolean>> {
    if (role === "owner") {
      return allPermissionsTrue();
    }
    const now = Date.now();
    const hit = this.rolePermissionsCache.get(role);
    if (hit && hit.expiresAt > now) {
      return hit.data;
    }
    try {
      await this.ensureDefaultRolePermissions();
      const rows = await this.prisma.rolePermission.findMany({
        where: { role }
      });
      const base = Object.fromEntries(PERMISSION_DEFINITIONS.map((d) => [d.key, false]));
      for (const row of rows) {
        base[row.key] = row.allowed;
      }
      this.rolePermissionsCache.set(role, {
        expiresAt: now + AuthService.ROLE_PERM_TTL_MS,
        data: base
      });
      return base;
    } catch (error) {
      // Не ломаем /auth/me при временной недоступности таблицы прав
      console.error("getPermissionsForRole", error);
      return defaultAllowedForRole(role);
    }
  }

  async getRolePermissionsMatrix() {
    try {
      await this.ensureDefaultRolePermissions();
      const rows = await this.prisma.rolePermission.findMany();
      const matrix: Record<string, Record<string, boolean>> = {};
      for (const role of MATRIX_ROLES) {
        matrix[role] = Object.fromEntries(PERMISSION_DEFINITIONS.map((d) => [d.key, false]));
      }
      for (const row of rows) {
        if (!matrix[row.role]) continue;
        matrix[row.role][row.key] = row.allowed;
      }
      // Owner column is always full for display consistency
      matrix.owner = allPermissionsTrue();
      return {
        definitions: PERMISSION_DEFINITIONS,
        roles: MATRIX_ROLES,
        matrix
      };
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async updateRolePermissionCell(role: UserRole, key: string, allowed: boolean) {
    if (role === "owner") {
      throw new BadRequestException("Права владельца нельзя изменять — полный доступ всегда включён");
    }
    if (!MATRIX_ROLES.includes(role)) {
      throw new BadRequestException("Недопустимая роль");
    }
    if (!this.isValidPermissionKey(key)) {
      throw new BadRequestException("Неизвестная функция");
    }
    try {
      const existing = await this.prisma.rolePermission.findFirst({
        where: { role, key }
      });
      if (existing) {
        await this.prisma.rolePermission.update({
          where: { id: existing.id },
          data: { allowed }
        });
      } else {
        await this.prisma.rolePermission.create({
          data: { role, key, allowed }
        });
      }
      this.rolePermissionsCache.delete(role);
      const matrix = await this.getRolePermissionsMatrix();
      if (!matrix) throw new Error("role permissions matrix unavailable");
      return matrix;
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async invalidateSessionByToken(token: string) {
    try {
      const tokenHash = this.hashToken(token);
      await this.prisma.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    } catch (error) {
      this.handleDbError(error);
    }
  }

  async resolveSession(token: string): Promise<ActiveSession | null> {
    try {
      const tokenHash = this.hashToken(token);
      const session = await this.prisma.session.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { isActive: true }
        },
        include: {
          user: {
            select: { id: true, email: true, role: true, name: true }
          }
        }
      });
      if (!session) return null;
      return session;
    } catch {
      // For guards, treat DB failures as no session so public endpoints still work.
      return null;
    }
  }

  hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  hashPassword(plain: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(plain, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
  }

  verifyPassword(plain: string, encoded: string): boolean {
    const [algo, salt, hash] = encoded.split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const calculated = scryptSync(plain, salt, 64).toString("hex");
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private handleDbError(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Can't reach database server")) {
      throw new ServiceUnavailableException("База данных недоступна");
    }
    throw error;
  }
}
