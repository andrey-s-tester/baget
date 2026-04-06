import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AUTH_COOKIE_NAME } from "./auth.constants";
import { Public, Roles } from "./auth.decorators";
import { AuthService } from "./auth.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateRolePermissionDto } from "./dto/update-role-permission.dto";
import { UpdateUserAccessDto } from "./dto/update-user-access.dto";

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  user?: {
    id: string;
    email: string;
    role: string;
    name: string | null;
  };
};

function readCookie(rawCookie: string | undefined, key: string): string | null {
  if (!rawCookie) return null;
  const parts = rawCookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part.startsWith(`${key}=`)) continue;
    const value = part.slice(key.length + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** На HTTPS-домене задайте COOKIE_SECURE=1 (docker-compose прокидывает из .env). */
function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "1";
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: {
      cookie: (name: string, value: string, opts: Record<string, unknown>) => void;
    }
  ) {
    const user = await this.authService.validateCredentials(body.email, body.password);
    if (!user) throw new UnauthorizedException("Неверный логин или пароль");

    await this.authService.ensureBackofficeEmployeeRow(user.id, user.role);

    const forwarded = req.headers["x-forwarded-for"];
    const firstIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ipAddress = firstIp?.split(",")[0]?.trim() || req.socket.remoteAddress || undefined;
    const userAgentHeader = req.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
    const { token, expiresAt } = await this.authService.createSession(
      user.id,
      userAgent,
      ipAddress
    );
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      expires: expiresAt
    });

    return { ok: true, user };
  }

  @Post("logout")
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: {
      clearCookie: (name: string, opts: Record<string, unknown>) => void;
    }
  ) {
    const cookieHeader = normalizeHeader(req.headers.cookie);
    const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    if (token) {
      await this.authService.invalidateSessionByToken(token);
    }
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/"
    });
    return { ok: true };
  }

  @Get("me")
  async me(@Req() req: RequestWithUser) {
    if (!req.user) throw new UnauthorizedException("Unauthorized");
    await this.authService.ensureBackofficeEmployeeRow(req.user.id, req.user.role as UserRole);
    const permissions = await this.authService.getPermissionsForRole(req.user.role as UserRole);
    const sellerStore = await this.authService.getSellerStoreForUser(req.user.id);
    return {
      ok: true,
      user: {
        ...req.user,
        sellerStoreId: sellerStore?.id ?? null,
        sellerStoreName: sellerStore?.name ?? null
      },
      permissions
    };
  }

  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  @Get("users")
  async users() {
    const users = await this.authService.listAccessUsers();
    return { ok: true, users };
  }

  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  @Post("users")
  async createUser(@Body() body: CreateUserDto) {
    const user = await this.authService.createAccessUser(body);
    return { ok: true, user };
  }

  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  @Patch("users/:id")
  async updateUser(@Param("id") id: string, @Body() body: UpdateUserAccessDto) {
    const user = await this.authService.updateAccessUser(id, body);
    return { ok: true, user };
  }

  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  @Delete("users/:id")
  async deleteUser(@Param("id") id: string) {
    await this.authService.deleteAccessUser(id);
    return { ok: true };
  }

  @Roles(UserRole.owner, UserRole.admin)
  @Get("role-permissions")
  async rolePermissions() {
    const data = await this.authService.getRolePermissionsMatrix();
    return { ok: true, ...data };
  }

  @Roles(UserRole.owner, UserRole.admin)
  @Patch("role-permissions")
  async patchRolePermission(@Body() body: UpdateRolePermissionDto) {
    const data = await this.authService.updateRolePermissionCell(body.role, body.key, body.allowed);
    return { ok: true, ...data };
  }
}
