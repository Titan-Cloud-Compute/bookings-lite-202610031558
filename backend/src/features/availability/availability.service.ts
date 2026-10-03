import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AvailabilityWindowDto,
  BlockedSlotDto,
  CreateBlockRequest,
  PutWindowsRequest,
  SlotDto,
  generateSlots,
  isIsoDate,
  validateCreateBlock,
  validateWindows,
} from '../../shared/contracts/availability';

interface WindowRow {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

interface BlockRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

function toWindowDto(r: WindowRow): AvailabilityWindowDto {
  return { id: r.id, dayOfWeek: r.dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute };
}

function toBlockDto(r: BlockRow): BlockedSlotDto {
  return { id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() };
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async listWindows(providerId: string): Promise<AvailabilityWindowDto[]> {
    const rows = await this.prisma.availabilityWindow.findMany({
      where: { providerId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
    return rows.map(toWindowDto);
  }

  /** Replace the provider's whole weekly schedule atomically. */
  async replaceWindows(providerId: string, body: unknown): Promise<AvailabilityWindowDto[]> {
    const errors = validateWindows(body);
    if (errors.length) throw new BadRequestException(errors);
    const { windows } = body as PutWindowsRequest;
    await this.prisma.$transaction([
      this.prisma.availabilityWindow.deleteMany({ where: { providerId } }),
      this.prisma.availabilityWindow.createMany({
        data: windows.map((w) => ({
          providerId,
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      }),
    ]);
    return this.listWindows(providerId);
  }

  async listBlocks(providerId: string): Promise<BlockedSlotDto[]> {
    const rows = await this.prisma.blockedSlot.findMany({
      where: { providerId },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toBlockDto);
  }

  async createBlock(providerId: string, body: unknown): Promise<BlockedSlotDto> {
    const errors = validateCreateBlock(body);
    if (errors.length) throw new BadRequestException(errors);
    const input = body as CreateBlockRequest;
    const row = await this.prisma.blockedSlot.create({
      data: { providerId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) },
    });
    return toBlockDto(row);
  }

  /** Remove one of the provider's own blocks; another provider's id is a 404. */
  async deleteBlock(providerId: string, id: string): Promise<{ ok: true }> {
    const res = await this.prisma.blockedSlot.deleteMany({ where: { id, providerId } });
    if (!res.count) throw new NotFoundException('block not found');
    return { ok: true };
  }

  /** Bookable slots for a service on a date (read by book-appointment). */
  async slots(serviceId: string, date: string): Promise<SlotDto[]> {
    if (!serviceId) throw new BadRequestException(['serviceId is required']);
    if (!isIsoDate(date)) throw new BadRequestException(['date must be YYYY-MM-DD']);
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || !service.active) throw new NotFoundException('service not found');
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const [windows, blocks] = await Promise.all([
      this.prisma.availabilityWindow.findMany({ where: { providerId: service.providerId } }),
      this.prisma.blockedSlot.findMany({
        where: { providerId: service.providerId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      }),
    ]);
    return generateSlots(windows, blocks.map(toBlockDto), date, service.durationMinutes);
  }
}
