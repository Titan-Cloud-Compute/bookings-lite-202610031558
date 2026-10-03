import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { FEATURE_MODULES } from '../index';
import { AvailabilityController } from './availability.controller';
import { AvailabilityModule } from './availability.module';
import { AvailabilityService } from './availability.service';

const MONDAY = '2026-10-05';

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('lt' in v && !(row[k] < v.lt)) return false;
      if ('gt' in v && !(row[k] > v.gt)) return false;
      return true;
    }
    return row[k] === v;
  });
}

function prismaMock() {
  let n = 0;
  const windows: any[] = [];
  const blocks: any[] = [];
  const services: any[] = [
    { id: 'svc1', providerId: 'prov1', durationMinutes: 30, active: true },
    { id: 'svc-off', providerId: 'prov1', durationMinutes: 30, active: false },
  ];
  const table = (rows: any[]) => ({
    findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    deleteMany: jest.fn(async ({ where }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { count: hit.length };
    }),
    createMany: jest.fn(async ({ data }: any) => {
      for (const d of data) rows.push({ id: `w${++n}`, ...d });
      return { count: data.length };
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `b${++n}`, ...data };
      rows.push(row);
      return row;
    }),
  });
  const prisma: any = {
    windows,
    blocks,
    availabilityWindow: table(windows),
    blockedSlot: table(blocks),
    service: { findUnique: jest.fn(async ({ where }: any) => services.find((s) => s.id === where.id) ?? null) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function ctxFor(handler: (...a: any[]) => unknown, role: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AvailabilityController,
    switchToHttp: () => ({ getRequest: () => ({ session: { userId: 'u1', role, firmId: null } }) }),
  } as unknown as ExecutionContext;
}

describe('availability feature', () => {
  const req: any = { session: { userId: 'prov1', role: 'MANAGER', firmId: null } };

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(AvailabilityModule);
  });

  it('provider sets Monday 09:00-12:00, blocks 10:00-10:30, and only valid slots are bookable', async () => {
    const controller = new AvailabilityController(new AvailabilityService(prismaMock()));
    const saved = await controller.replaceWindows(req, { windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }] });
    expect(saved).toEqual([expect.objectContaining({ dayOfWeek: 1, startMinute: 540, endMinute: 720 })]);
    const block = await controller.createBlock(req, {
      startsAt: `${MONDAY}T10:00:00.000Z`,
      endsAt: `${MONDAY}T10:30:00.000Z`,
    });
    expect(await controller.blocks(req)).toEqual([block]);

    const starts = (await controller.slots('svc1', MONDAY)).map((s) => s.startsAt.slice(11, 16));
    expect(starts).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30']);
    expect(await controller.slots('svc1', '2026-10-06')).toEqual([]);

    await controller.deleteBlock(req, block.id);
    expect((await controller.slots('svc1', MONDAY)).map((s) => s.startsAt.slice(11, 16))).toContain('10:00');
  });

  it('PUT replaces the schedule and windows are provider-scoped', async () => {
    const controller = new AvailabilityController(new AvailabilityService(prismaMock()));
    await controller.replaceWindows(req, { windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }] });
    await controller.replaceWindows(req, { windows: [{ dayOfWeek: 2, startMinute: 600, endMinute: 660 }] });
    expect((await controller.windows(req)).map((w) => w.dayOfWeek)).toEqual([2]);
    expect(await controller.windows({ session: { userId: 'other' } } as any)).toEqual([]);
  });

  it('rejects invalid or overlapping windows and bad blocks with 400', async () => {
    const controller = new AvailabilityController(new AvailabilityService(prismaMock()));
    await expect(
      controller.replaceWindows(req, { windows: [{ dayOfWeek: 1, startMinute: 720, endMinute: 540 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.replaceWindows(req, {
        windows: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
          { dayOfWeek: 1, startMinute: 600, endMinute: 800 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createBlock(req, { startsAt: 'x', endsAt: 'y' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.slots('svc1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cannot delete another provider's block; unknown/inactive service is 404", async () => {
    const controller = new AvailabilityController(new AvailabilityService(prismaMock()));
    const block = await controller.createBlock(req, { startsAt: `${MONDAY}T10:00:00.000Z`, endsAt: `${MONDAY}T10:30:00.000Z` });
    await expect(controller.deleteBlock({ session: { userId: 'other' } } as any, block.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.slots('missing', MONDAY)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.slots('svc-off', MONDAY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('USER cannot edit availability but can read slots', () => {
    const guard = new RolesGuard(new Reflector());
    const p = AvailabilityController.prototype;
    for (const h of [p.windows, p.replaceWindows, p.blocks, p.createBlock, p.deleteBlock]) {
      expect(() => guard.canActivate(ctxFor(h, 'USER'))).toThrow(ForbiddenException);
      expect(guard.canActivate(ctxFor(h, 'MANAGER'))).toBe(true);
    }
    expect(guard.canActivate(ctxFor(p.slots, 'USER'))).toBe(true);
  });
});
