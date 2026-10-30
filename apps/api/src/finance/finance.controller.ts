import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { CreateInvoiceBody, CreditBody, DisputeBody, FinanceService, RecordPaymentBody } from './finance.service';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Roles('finance')
  @Post('invoices')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateInvoiceBody)) body: CreateInvoiceBody) {
    return this.finance.create(user, body);
  }

  @Roles('finance', 'ops_manager', 'client')
  @Get('invoices')
  list(@CurrentUser() user: AuthUser) {
    return this.finance.list(user);
  }

  @Roles('finance', 'ops_manager', 'client')
  @Get('invoices/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.get(user, id);
  }

  @Roles('finance')
  @Post('invoices/:id/payments')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(RecordPaymentBody)) body: RecordPaymentBody) {
    return this.finance.recordPayment(user, id, body);
  }

  @Roles('finance')
  @Post('payments/:id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.verifyPayment(user, id);
  }

  @Roles('finance')
  @Post('invoices/:id/dispute')
  dispute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(DisputeBody)) body: z.infer<typeof DisputeBody>) {
    return this.finance.setDispute(user, id, body);
  }

  @Roles('finance', 'ops_manager')
  @Post('invoices/:id/credit-approval')
  credit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CreditBody)) body: z.infer<typeof CreditBody>) {
    return this.finance.approveCredit(user, id, body.reason);
  }

  @Roles('finance')
  @Post('invoices/:id/reminders')
  remind(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.remindNow(user, id);
  }
}
