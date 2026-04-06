import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { StoresService } from "./stores.service";

@Controller("stores")
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Public()
  @Get()
  list() {
    return this.storesService.list();
  }

  @Post()
  @Roles(...BACKOFFICE_ROLES)
  create(@Body() body: { name: string; address?: string; phone?: string }) {
    return this.storesService.create(body);
  }

  @Patch()
  @Roles(...BACKOFFICE_ROLES)
  update(@Body() body: { id: string; name?: string; address?: string; phone?: string; isActive?: boolean }) {
    return this.storesService.update(body.id, body);
  }

  @Delete(":id")
  @Roles(UserRole.owner, UserRole.admin)
  delete(@Param("id") id: string) {
    return this.storesService.delete(id);
  }
}
