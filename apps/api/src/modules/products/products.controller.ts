import { Body, Controller, Delete, Get, Patch, Post } from "@nestjs/common";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("active")
  @Public()
  async active() {
    await this.products.ensureSeeded();
    return this.products.listActivePublic();
  }

  @Get()
  @Roles(...BACKOFFICE_ROLES)
  async list() {
    await this.products.ensureSeeded();
    return this.products.list();
  }

  @Post()
  @Roles(...BACKOFFICE_ROLES)
  create(
    @Body()
    body: {
      title: string;
      artist?: string;
      sizeLabel?: string;
      priceRub?: number;
      imageUrl?: string;
      description?: string | null;
      stockQty?: number;
      inStock?: boolean;
      isActive?: boolean;
    }
  ) {
    return this.products.create(body);
  }

  @Patch()
  @Roles(...BACKOFFICE_ROLES)
  patch(
    @Body()
    body: {
      id: string;
      title?: string;
      artist?: string;
      sizeLabel?: string;
      priceRub?: number;
      imageUrl?: string;
      description?: string | null;
      stockQty?: number;
      inStock?: boolean;
      isActive?: boolean;
    }
  ) {
    if (!body?.id) return { ok: false as const, message: "Нет id" };
    const { id, ...rest } = body;
    return this.products.update(id, rest);
  }

  @Delete()
  @Roles(...BACKOFFICE_ROLES)
  remove(@Body() body: { id: string }) {
    if (!body?.id) return { ok: false as const, message: "Нет id" };
    return this.products.delete(body.id);
  }
}
