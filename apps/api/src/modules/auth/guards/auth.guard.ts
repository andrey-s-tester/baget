import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "../auth.service";
import { AUTH_COOKIE_NAME } from "../auth.constants";
import { IS_PUBLIC_KEY } from "../auth.decorators";

type RequestWithUser = {
  headers: { cookie?: string };
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

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readCookie(request.headers.cookie, AUTH_COOKIE_NAME);
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException("Unauthorized");
    }
    const session = await this.authService.resolveSession(token);
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException("Unauthorized");
    }
    request.user = session.user;
    return true;
  }
}
