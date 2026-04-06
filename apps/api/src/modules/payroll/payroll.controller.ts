import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Roles } from "../auth/auth.decorators";
import { CreatePayrollPeriodDto } from "./dto/create-payroll-period.dto";
import { UpdateMasterAlgorithmDto } from "./dto/update-master-algorithm.dto";
import { UpdatePayrollPeriodDto } from "./dto/update-payroll-period.dto";
import { PayrollService } from "./payroll.service";

type ReqWithUser = {
  user?: { id: string; email: string; role: UserRole; name: string | null };
};

@Controller("payroll")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  private ctx(req: ReqWithUser) {
    const u = req.user;
    if (!u) throw new UnauthorizedException();
    return { id: u.id, role: u.role as UserRole };
  }

  @Get("payout-history")
  @Roles(...BACKOFFICE_ROLES)
  payoutHistory(
    @Req() req: ReqWithUser,
    @Query("userId") userId?: string,
    @Query("limit") limit?: string
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.payroll.getPayoutHistory(this.ctx(req), {
      userId: userId?.trim(),
      limit: Number.isFinite(parsed) ? parsed : undefined
    });
  }

  @Get("payout-summary")
  @Roles(...BACKOFFICE_ROLES)
  payoutSummary(@Req() req: ReqWithUser) {
    return this.payroll.getPayoutSummary(this.ctx(req));
  }

  @Get("periods")
  @Roles(...BACKOFFICE_ROLES)
  listPeriods(@Req() req: ReqWithUser) {
    return this.payroll.listPeriodSummaries(this.ctx(req));
  }

  @Get("periods/:id")
  @Roles(...BACKOFFICE_ROLES)
  getPeriod(@Param("id") id: string, @Req() req: ReqWithUser) {
    return this.payroll.getPeriodDetail(id, this.ctx(req));
  }

  @Post("periods")
  @Roles(...BACKOFFICE_ROLES)
  createPeriod(@Body() body: CreatePayrollPeriodDto, @Req() req: ReqWithUser) {
    return this.payroll.createPeriod(body, this.ctx(req));
  }

  @Patch("periods/:id")
  @Roles(...BACKOFFICE_ROLES)
  updatePeriod(
    @Param("id") id: string,
    @Body() body: UpdatePayrollPeriodDto,
    @Req() req: ReqWithUser
  ) {
    return this.payroll.updatePeriod(id, body, this.ctx(req));
  }

  @Delete("periods/:id")
  @Roles(...BACKOFFICE_ROLES)
  deletePeriod(@Param("id") id: string, @Req() req: ReqWithUser) {
    return this.payroll.deletePeriod(id, this.ctx(req));
  }

  @Post("periods/:id/lines")
  @Roles(...BACKOFFICE_ROLES)
  upsertPeriodLines(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: ReqWithUser
  ) {
    return this.payroll.upsertPeriodLines(id, body, this.ctx(req));
  }

  @Delete("periods/:id/lines/:lineId")
  @Roles(...BACKOFFICE_ROLES)
  deletePeriodLine(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Req() req: ReqWithUser
  ) {
    return this.payroll.deletePeriodLine(id, lineId, this.ctx(req));
  }

  @Get("sellers")
  @Roles(...BACKOFFICE_ROLES)
  listSellers(@Req() req: ReqWithUser) {
    return this.payroll.listSellerAlgorithms(this.ctx(req));
  }

  @Patch("sellers/:userId")
  @Roles(...BACKOFFICE_ROLES)
  updateSellerAlgorithm(
    @Param("userId") userId: string,
    @Body() body: { baseAmount: number; percent: number },
    @Req() req: ReqWithUser
  ) {
    return this.payroll.updateSellerAlgorithm(userId, body, this.ctx(req));
  }

  @Get("masters")
  @Roles(...BACKOFFICE_ROLES)
  listMasters(@Req() req: ReqWithUser) {
    return this.payroll.listMasterAlgorithms(this.ctx(req));
  }

  @Patch("masters/:userId")
  @Roles(...BACKOFFICE_ROLES)
  updateMasterAlgorithm(
    @Param("userId") userId: string,
    @Body() body: UpdateMasterAlgorithmDto,
    @Req() req: ReqWithUser
  ) {
    return this.payroll.updateMasterAlgorithm(userId, body, this.ctx(req));
  }

  @Get("reports/masters")
  @Roles(...BACKOFFICE_ROLES)
  getMasterReport(
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Req() req: ReqWithUser
  ) {
    return this.payroll.getMasterSalaryReport(dateFrom, dateTo, this.ctx(req));
  }
}
