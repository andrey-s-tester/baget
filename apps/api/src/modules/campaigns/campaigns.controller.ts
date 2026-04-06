import { Body, Controller, Delete, Get, Patch, Post } from "@nestjs/common";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { CampaignsService } from "./campaigns.service";

@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  /** Публично — для витрины (только активные в срок) */
  @Public()
  @Get("active")
  active() {
    return this.campaigns.listActivePublic();
  }

  @Get()
  @Roles(...BACKOFFICE_ROLES)
  list() {
    return this.campaigns.list();
  }

  @Post()
  @Roles(...BACKOFFICE_ROLES)
  create(
    @Body()
    body: {
      title: string;
      description?: string | null;
      isActive?: boolean;
      validFrom?: string | null;
      validUntil?: string | null;
    }
  ) {
    return this.campaigns.create(body);
  }

  @Patch()
  @Roles(...BACKOFFICE_ROLES)
  patch(
    @Body()
    body: {
      id: string;
      title?: string;
      description?: string | null;
      isActive?: boolean;
      validFrom?: string | null;
      validUntil?: string | null;
    }
  ) {
    if (!body.id) {
      return { ok: false as const, message: "Нет id" };
    }
    const { id, ...rest } = body;
    return this.campaigns.update(id, rest);
  }

  @Delete()
  @Roles(...BACKOFFICE_ROLES)
  remove(@Body() body: { id: string }) {
    if (!body?.id) {
      return { ok: false as const, message: "Нет id" };
    }
    return this.campaigns.delete(body.id);
  }
}
