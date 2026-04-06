import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CustomersModule } from "./customers/customers.module";
import { MaterialsModule } from "./materials/materials.module";
import { OrdersModule } from "./orders/orders.module";
import { PayrollModule } from "./payroll/payroll.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PricingModule } from "./pricing/pricing.module";
import { PromoCodesModule } from "./promo-codes/promo-codes.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { ProductsModule } from "./products/products.module";
import { StoresModule } from "./stores/stores.module";
import { SystemModule } from "./system/system.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SystemModule,
    PricingModule,
    CatalogModule,
    OrdersModule,
    CustomersModule,
    StoresModule,
    PromoCodesModule,
    CampaignsModule,
    ProductsModule,
    MaterialsModule,
    PayrollModule
  ]
})
export class AppModule {}
