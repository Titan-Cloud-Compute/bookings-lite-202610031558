import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AUTH_ROLES, isAuthRole } from './index';

function prismaUserRoles(): string[] {
  const schema = readFileSync(resolve(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
  const match = schema.match(/enum\s+UserRole\s*\{([^}]*)\}/);
  if (!match) throw new Error('UserRole enum not found in prisma/schema.prisma');
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

describe('@contracts/auth', () => {
  it('AUTH_ROLES matches the Prisma UserRole enum exactly', () => {
    expect([...AUTH_ROLES]).toEqual(prismaUserRoles());
  });

  it('web and backend copies of the contract are identical', () => {
    const backend = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const web = readFileSync(
      resolve(__dirname, '../../../../../web/src/shared/contracts/auth/index.ts'),
      'utf8',
    );
    expect(web).toBe(backend);
  });

  it('isAuthRole accepts only known roles', () => {
    for (const role of AUTH_ROLES) expect(isAuthRole(role)).toBe(true);
    expect(isAuthRole('SUPER_ADMIN')).toBe(false);
    expect(isAuthRole('')).toBe(false);
    expect(isAuthRole(undefined)).toBe(false);
  });
});
