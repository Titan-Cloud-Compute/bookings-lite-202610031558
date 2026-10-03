/**
 * @contracts/services — shared Service contract for Bookings Lite
 * (Story: create-service).
 *
 * This file is byte-identical in backend/src/shared/contracts/services and
 * web/src/shared/contracts/services (enforced by services-contract.spec.ts).
 */

/** Roles allowed to create services (providers). */
export const SERVICE_PROVIDER_ROLES = ['MANAGER', 'ADMIN'] as const;

export const SERVICE_NAME_MAX = 120;
export const SERVICE_DURATION_MAX = 24 * 60;

/** A service as the API returns it. */
export interface ServiceDto {
  id: string;
  providerId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /api/services. */
export interface CreateServiceRequest {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

/** Validate a create request; returns a list of field errors (empty when valid). */
export function validateCreateService(input: unknown): string[] {
  const errors: string[] = [];
  const v = (input ?? {}) as Partial<Record<keyof CreateServiceRequest, unknown>>;
  if (typeof v.name !== 'string' || !v.name.trim()) errors.push('name is required');
  else if (v.name.trim().length > SERVICE_NAME_MAX) errors.push(`name must be at most ${SERVICE_NAME_MAX} characters`);
  if (typeof v.durationMinutes !== 'number' || !Number.isInteger(v.durationMinutes) || v.durationMinutes <= 0) {
    errors.push('durationMinutes must be a positive integer');
  } else if (v.durationMinutes > SERVICE_DURATION_MAX) {
    errors.push(`durationMinutes must be at most ${SERVICE_DURATION_MAX}`);
  }
  if (typeof v.priceCents !== 'number' || !Number.isInteger(v.priceCents) || v.priceCents < 0) {
    errors.push('priceCents must be a non-negative integer');
  }
  return errors;
}
