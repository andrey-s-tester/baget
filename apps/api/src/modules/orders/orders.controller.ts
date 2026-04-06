import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Query, Req } from "@nestjs/common";
import { OrderStatus, UserRole } from "@prisma/client";

import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";

import { Public, Roles } from "../auth/auth.decorators";

import { OrdersService } from "./orders.service";

type ReqWithUser = {
  user?: { id: string; email: string; role: UserRole; name: string | null };
};



@Controller("orders")

export class OrdersController {

  constructor(private readonly ordersService: OrdersService) {}



  @Get()

  @Roles(...BACKOFFICE_ROLES)

  list(
    @Query("limit") limitStr?: string,
    @Query("lite") liteStr?: string,
    @Query("ids") idsStr?: string,
    @Query("from") fromStr?: string,
    @Query("to") toStr?: string
  ) {
    const ids =
      idsStr
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    if (ids.length > 0) {
      return this.ordersService.list({ ids });
    }
    const limit = limitStr ? Number(limitStr) : undefined;
    const lite = liteStr === "1" || liteStr === "true";
    let from: Date | undefined;
    let to: Date | undefined;
    if (fromStr?.trim()) {
      const d = new Date(fromStr.trim());
      if (!Number.isNaN(d.getTime())) from = d;
    }
    if (toStr?.trim()) {
      const d = new Date(toStr.trim());
      if (!Number.isNaN(d.getTime())) to = d;
    }
    return this.ordersService.list({
      limit: Number.isFinite(limit) ? limit : undefined,
      lite,
      from,
      to
    });
  }



  @Public()

  @Post()

  create(

    @Body()

    body: {

      customerName: string;

      phone?: string;

      email?: string;

      storeId?: string;

      store?: string;

      comment?: string;

      total: number;

      config: Record<string, unknown>;

    }

  ) {

    return this.ordersService.create(body);

  }



  @Patch()

  @Roles(...BACKOFFICE_ROLES)

  patchOrder(
    @Body() body: { id: string; status?: OrderStatus; addShowcaseProductId?: string },
    @Req() req: ReqWithUser
  ) {
    if (!body?.id?.trim()) {
      throw new BadRequestException("Укажите id заказа");
    }
    if (body.addShowcaseProductId) {
      return this.ordersService.addShowcaseProductToOrder(body.id, body.addShowcaseProductId);
    }
    if (body.status != null) {
      return this.ordersService.updateStatus(body.id, body.status, req.user?.id ?? null);
    }
    throw new BadRequestException("Укажите status или addShowcaseProductId");
  }



  @Delete()

  @Roles(UserRole.owner, UserRole.admin, UserRole.manager)

  delete(@Body() body: { id: string }) {

    return this.ordersService.delete(body.id);

  }

}

