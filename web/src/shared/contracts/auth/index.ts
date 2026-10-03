/**
 * @contracts/auth — shared role/session contract for Bookings Lite.
 *
 * This file is byte-identical in backend/src/shared/contracts/auth and
 * web/src/shared/contracts/auth. AUTH_ROLES is pinned to the Prisma
 * `UserRole` enum (backend/prisma/schema.prisma) by auth-contract.spec.ts.
 */

/** Every role the Prisma `UserRole` enum defines, in declaration order. */
export const AUTH_ROLES = ['ADMIN', 'MANAGER', 'USER'] as const;

/** A role a signed-in user can hold. Mirrors Prisma `UserRole`. */
export type AuthRole = (typeof AUTH_ROLES)[number];

/** The signed-in user as the session exposes it to the app. */
export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: AuthRole;
}

/** Narrow an unknown value to an AuthRole. */
export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value);
}
