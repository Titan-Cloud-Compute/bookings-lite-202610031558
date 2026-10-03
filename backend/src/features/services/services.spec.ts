import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { FEATURE_MODULES } from '../index';
import { ServicesModule } from './services.module';

function prismaMock() {
  const rows: any[] = [];
  return {
    rows,
    service: {
      create: jest.fn(async ({ data }: any) => {
        const now = new Date();
        const row = { id: `s${rows.length + 1}`, active: true, createdAt: now, updatedAt: now, ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)),
      ),
    },
  };
}

function ctxFor(handler: (...a: any[]) => unknown, role: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ServicesController,
    switchToHttp: () => ({ getRequest: () => ({ session: { userId: 'u1', role, firmId: null } }) }),
  } as unknown as ExecutionContext;
}

describe('services feature', () => {
  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(ServicesModule);
  });

  it('provider creates a service that appears in their list and the bookable catalog', async () => {
    const prisma = prismaMock();
    const controller = new ServicesController(new ServicesService(prisma as any));
    const req: any = { session: { userId: 'prov1', role: 'MANAGER', firmId: null } };
    const created = await controller.create(req, { name: ' Haircut ', durationMinutes: 30, priceCents: 2500 });
    expect(created).toMatchObject({ name: 'Haircut', providerId: 'prov1', durationMinutes: 30, priceCents: 2500, active: true });
    expect((await controller.mine(req)).map((s) => s.id)).toEqual([created.id]);
    expect((await controller.mine({ session: { userId: 'other' } } as any))).toEqual([]);
    expect((await controller.catalog()).map((s) => s.id)).toEqual([created.id]);
  });

  it('ignores a client-supplied providerId', async () => {
    const prisma = prismaMock();
    const controller = new ServicesController(new ServicesService(prisma as any));
    const req: any = { session: { userId: 'prov1', role: 'MANAGER' } };
    const created = await controller.create(req, { name: 'X', durationMinutes: 10, priceCents: 0, providerId: 'evil' } as any);
    expect(created.providerId).toBe('prov1');
  });

  it('rejects invalid input with 400', async () => {
    const controller = new ServicesController(new ServicesService(prismaMock() as any));
    const req: any = { session: { userId: 'prov1', role: 'MANAGER' } };
    await expect(controller.create(req, { name: '', durationMinutes: 0, priceCents: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a client (USER) on create and mine with 403, allows the catalog', () => {
    const guard = new RolesGuard(new Reflector());
    const proto = ServicesController.prototype;
    expect(() => guard.canActivate(ctxFor(proto.create, 'USER'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctxFor(proto.mine, 'USER'))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctxFor(proto.catalog, 'USER'))).toBe(true);
    expect(guard.canActivate(ctxFor(proto.create, 'MANAGER'))).toBe(true);
  });
});
