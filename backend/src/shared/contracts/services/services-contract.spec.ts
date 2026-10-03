import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SERVICE_PROVIDER_ROLES, validateCreateService } from './index';
import { AUTH_ROLES } from '../auth';

describe('@contracts/services', () => {
  it('web and backend copies of the contract are identical', () => {
    const backend = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const web = readFileSync(
      resolve(__dirname, '../../../../../web/src/shared/contracts/services/index.ts'),
      'utf8',
    );
    expect(web).toBe(backend);
  });

  it('provider roles are real auth roles and exclude USER', () => {
    for (const r of SERVICE_PROVIDER_ROLES) expect((AUTH_ROLES as readonly string[]).includes(r)).toBe(true);
    expect((SERVICE_PROVIDER_ROLES as readonly string[]).includes('USER')).toBe(false);
  });

  it('schema.prisma declares the Service model with the contract fields', () => {
    const schema = readFileSync(resolve(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
    const m = schema.match(/model\s+Service\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    for (const f of ['providerId', 'name', 'durationMinutes', 'priceCents', 'active']) {
      expect(m![1]).toMatch(new RegExp(`\\b${f}\\b`));
    }
  });

  it('accepts a valid service', () => {
    expect(validateCreateService({ name: 'Haircut', durationMinutes: 30, priceCents: 2500 })).toEqual([]);
    expect(validateCreateService({ name: 'Free consult', durationMinutes: 15, priceCents: 0 })).toEqual([]);
  });

  it('rejects missing or invalid fields', () => {
    expect(validateCreateService({})).toHaveLength(3);
    expect(validateCreateService({ name: ' ', durationMinutes: 30, priceCents: 1 })).toHaveLength(1);
    expect(validateCreateService({ name: 'x', durationMinutes: 0, priceCents: 1 })).toHaveLength(1);
    expect(validateCreateService({ name: 'x', durationMinutes: 1.5, priceCents: 1 })).toHaveLength(1);
    expect(validateCreateService({ name: 'x', durationMinutes: 30, priceCents: -1 })).toHaveLength(1);
    expect(validateCreateService(null)).toHaveLength(3);
  });
});
