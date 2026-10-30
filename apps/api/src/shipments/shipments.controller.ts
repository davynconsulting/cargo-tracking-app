import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { STAFF_ROLES } from '../domain/workflow';
import {
  AssignTruckBody,
  CloseShipmentBody,
  CorrectEventBody,
  CreateShipmentBody,
  RecordMilestoneBody,
  ReviseEtaBody,
} from './shipments.schemas';
import { ShipmentsService } from './shipments.service';

const ListQuery = z.object({ status: z.enum(['open', 'closed']).optional() });

@Controller()
export class ShipmentsController {
  constructor(@Inject(ShipmentsService) private readonly shipments: ShipmentsService) {}

  @Roles('ops_manager', 'documentation')
  @Post('shipments')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateShipmentBody)) body: CreateShipmentBody) {
    return this.shipments.create(user, body);
  }

  @Roles(...STAFF_ROLES, 'client')
  @Get('shipments')
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.shipments.list(user, q);
  }

  @Roles(...STAFF_ROLES, 'client', 'driver')
  @Get('shipments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.get(user, id);
  }

  @Roles('ops_manager', 'documentation', 'clearing_agent', 'transport', 'driver')
  @Post('shipments/:id/milestones')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RecordMilestoneBody)) body: RecordMilestoneBody,
  ) {
    return this.shipments.recordMilestone(user, id, body);
  }

  @Roles('ops_manager', 'transport')
  @Post('shipments/:id/assignments')
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AssignTruckBody)) body: AssignTruckBody) {
    return this.shipments.assignTruck(user, id, body);
  }

  @Roles('ops_manager', 'transport', 'documentation')
  @Post('shipments/:id/eta')
  eta(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReviseEtaBody)) body: ReviseEtaBody) {
    return this.shipments.reviseEta(user, id, body);
  }

  @Roles('ops_manager')
  @Post('events/:id/corrections')
  correct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CorrectEventBody)) body: CorrectEventBody) {
    return this.shipments.correctEvent(user, id, body);
  }

  @Roles('ops_manager')
  @Post('shipments/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CloseShipmentBody)) body: CloseShipmentBody) {
    return this.shipments.close(user, id, body);
  }

  @Roles('driver')
  @Get('driver/jobs')
  jobs(@CurrentUser() user: AuthUser) {
    return this.shipments.driverJobs(user);
  }
}
