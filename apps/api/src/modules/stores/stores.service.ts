import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.store.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, phone: true, isActive: true }
    });
  }

  async create(data: { name: string; address?: string; phone?: string }) {
    const store = await this.prisma.store.create({
      data: {
        name: data.name.trim(),
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null
      }
    });
    return { ok: true, id: store.id };
  }

  async update(
    id: string,
    data: { name?: string; address?: string; phone?: string; isActive?: boolean }
  ) {
    return this.prisma.store.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.address !== undefined && {
          address: data.address?.trim() || null
        }),
        ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive })
      }
    });
  }

  async delete(id: string) {
    await this.prisma.store.delete({ where: { id } });
    return { ok: true };
  }
}
