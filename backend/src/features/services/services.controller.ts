import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { ServicesService } from './services.service';
import type { ServiceDto } from '../../shared/contracts/services';

function sessionUserId(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException('not authenticated');
  return id;
}

@ApiTags('services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** Provider creates a service; providerId always comes from the session. */
  @Post()
  @Roles('MANAGER', 'ADMIN')
  create(@Req() req: Request, @Body() body: unknown): Promise<ServiceDto> {
    return this.services.create(sessionUserId(req), body);
  }

  /** The signed-in provider's own services. */
  @Get('mine')
  @Roles('MANAGER', 'ADMIN')
  mine(@Req() req: Request): Promise<ServiceDto[]> {
    return this.services.listMine(sessionUserId(req));
  }

  /** Bookable catalog — any signed-in user (used by book-appointment). */
  @Get()
  @Roles('USER', 'MANAGER', 'ADMIN')
  catalog(): Promise<ServiceDto[]> {
    return this.services.listBookable();
  }
}
