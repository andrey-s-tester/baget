import { Injectable } from "@nestjs/common";
import { normalizePhone } from "../../utils/phone";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        orders: { select: { id: true, orderNumber: true } }
      }
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email ?? undefined,
      createdAt: c.createdAt.toISOString(),
      orderIds: c.orders.map((o) => o.id),
      orderNumbers: c.orders.map((o) => o.orderNumber)
    }));
  }

  async findByPhone(phone: string) {
    const norm = normalizePhone(phone);
    if (!norm || norm.length < 7) return null;
    const c = await this.prisma.customer.findUnique({
      where: { phoneNormalized: norm },
      include: { orders: { select: { id: true, orderNumber: true } } }
    });
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email ?? undefined,
      createdAt: c.createdAt.toISOString(),
      orderIds: c.orders.map((o) => o.id),
      orderNumbers: c.orders.map((o) => o.orderNumber)
    };
  }

  async upsertFromBody(body: {
    name?: string;
    phone: string;
    email?: string;
    orderId?: string;
  }) {
    const phone = body.phone.trim();
    const norm = normalizePhone(phone);
    if (!norm || norm.length < 7) {
      return { ok: false as const };
    }
    const name = (body.name ?? "—").trim() || "—";
    const email = body.email?.trim() || null;

    const customer = await this.prisma.customer.upsert({
      where: { phoneNormalized: norm },
      create: {
        name,
        phone,
        phoneNormalized: norm,
        email
      },
      update: {
        ...(name !== "—" && { name }),
        ...(email !== null && { email })
      }
    });

    if (body.orderId) {
      await this.prisma.order.updateMany({
        where: { id: body.orderId },
        data: { retailCustomerId: customer.id }
      });
    }

    return { ok: true as const };
  }

  /** Связать существующие заказы с покупателями по телефону */
  async syncFromOrders() {
    const orders = await this.prisma.order.findMany({
      where: {
        customerPhone: { not: null }
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        retailCustomerId: true
      }
    });

    let linked = 0;
    for (const o of orders) {
      const raw = (o.customerPhone ?? "").trim();
      const norm = normalizePhone(raw);
      if (norm.length < 7) continue;

      const customer = await this.prisma.customer.upsert({
        where: { phoneNormalized: norm },
        create: {
          name: o.customerName.trim() || "—",
          phone: raw,
          phoneNormalized: norm,
          email: o.customerEmail?.trim() || null
        },
        update: {
          name: o.customerName.trim() || undefined,
          ...(o.customerEmail?.trim() && { email: o.customerEmail.trim() })
        }
      });

      if (o.retailCustomerId !== customer.id) {
        await this.prisma.order.update({
          where: { id: o.id },
          data: { retailCustomerId: customer.id }
        });
        linked++;
      }
    }

    const count = await this.prisma.customer.count();
    return { ok: true, synced: count, ordersLinked: linked };
  }
}
