import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServiceRequest,
  ServiceDto,
  validateCreateService,
} from '../../shared/contracts/services';

interface ServiceRow {
  id: string;
  providerId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toServiceDto(row: ServiceRow): ServiceDto {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(providerId: string, body: unknown): Promise<ServiceDto> {
    const errors = validateCreateService(body);
    if (errors.length) throw new BadRequestException(errors);
    const input = body as CreateServiceRequest;
    const row = await this.prisma.service.create({
      data: {
        providerId,
        name: input.name.trim(),
        durationMinutes: input.durationMinutes,
        priceCents: input.priceCents,
      },
    });
    return toServiceDto(row);
  }

  async listMine(providerId: string): Promise<ServiceDto[]> {
    const rows = await this.prisma.service.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toServiceDto);
  }

  async listBookable(): Promise<ServiceDto[]> {
    const rows = await this.prisma.service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toServiceDto);
  }
}
