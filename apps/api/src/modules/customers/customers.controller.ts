import { Controller, Get, Post, Query } from "@nestjs/common";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /** Публичный поиск по телефону (сайт / оформление заказа без сессии админки) */
  @Get("by-phone")
  @Public()
  lookupByPhone(@Query("phone") phone: string) {
    return this.customersService.findByPhone(phone ?? "");
  }

  @Get()
  @Roles(...BACKOFFICE_ROLES)
  listOrFindByPhone(@Query("phone") phone?: string) {
    if (phone) return this.customersService.findByPhone(phone);
    return this.customersService.list();
  }

  @Post("sync")
  @Roles(...BACKOFFICE_ROLES)
  syncFromOrders() {
    return this.customersService.syncFromOrders();
  }
}
