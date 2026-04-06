import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { CalculatePriceDto } from "./dto/calculate-price.dto";
import { PricingService } from "./pricing.service";

@Controller("pricing")
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Public()
  @Get()
  getRules() {
    return this.pricingService.getRules();
  }

  @Patch()
  @Roles(...BACKOFFICE_ROLES)
  async updateRules(
    @Body()
    body: {
      frameWasteCoeff?: number;
      assemblyPrice?: number;
      minimalOrderPrice?: number;
      matboardPricePerM2?: number;
    }
  ) {
    const rules = await this.pricingService.updateRules(body);
    return { ok: true, rules };
  }

  @Public()
  @Post("calculate")
  calculate(@Body() payload: CalculatePriceDto) {
    return this.pricingService.calculate(payload);
  }
}
