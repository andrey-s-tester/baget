import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { PromoCodesService } from "./promo-codes.service";

@Controller("promo-codes")
export class PromoCodesController {
  constructor(private readonly promoCodeService: PromoCodesService) {}

  @Public()
  @Post("validate")
  validate(@Body() body: { code?: string; storeId?: string }) {
    return this.promoCodeService.validate(body.code ?? "", body.storeId ?? null);
  }

  @Get()
  @Roles(...BACKOFFICE_ROLES)
  list() {
    return this.promoCodeService.list();
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  create(
    @Body()
    body: {
      code: string;
      discountPercent?: number | null;
      discountAmount?: number | null;
    }
  ) {
    return this.promoCodeService.create(body);
  }

  @Patch()
  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)
  toggle(@Body() body: { code: string; isActive: boolean }) {
    return this.promoCodeService.toggle(body.code, body.isActive);
  }
}
