import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { AvailabilityService } from './availability.service';
import type { AvailabilityWindowDto, BlockedSlotDto, SlotDto } from '../../shared/contracts/availability';

function sessionUserId(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException('not authenticated');
  return id;
}

@ApiTags('availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('windows')
  @Roles('MANAGER', 'ADMIN')
  windows(@Req() req: Request): Promise<AvailabilityWindowDto[]> {
    return this.availability.listWindows(sessionUserId(req));
  }

  @Put('windows')
  @Roles('MANAGER', 'ADMIN')
  replaceWindows(@Req() req: Request, @Body() body: unknown): Promise<AvailabilityWindowDto[]> {
    return this.availability.replaceWindows(sessionUserId(req), body);
  }

  @Get('blocks')
  @Roles('MANAGER', 'ADMIN')
  blocks(@Req() req: Request): Promise<BlockedSlotDto[]> {
    return this.availability.listBlocks(sessionUserId(req));
  }

  @Post('blocks')
  @Roles('MANAGER', 'ADMIN')
  createBlock(@Req() req: Request, @Body() body: unknown): Promise<BlockedSlotDto> {
    return this.availability.createBlock(sessionUserId(req), body);
  }

  @Delete('blocks/:id')
  @Roles('MANAGER', 'ADMIN')
  deleteBlock(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    return this.availability.deleteBlock(sessionUserId(req), id);
  }

  /** Bookable slots for a service on a date — any signed-in user. */
  @Get('slots')
  @Roles('USER', 'MANAGER', 'ADMIN')
  slots(@Query('serviceId') serviceId: string, @Query('date') date: string): Promise<SlotDto[]> {
    return this.availability.slots(serviceId, date);
  }
}
