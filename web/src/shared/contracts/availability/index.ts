/**
 * @contracts/availability — shared availability contract for Bookings Lite
 * (Story: set-availability).
 *
 * This file is byte-identical in backend/src/shared/contracts/availability and
 * web/src/shared/contracts/availability (enforced by availability-contract.spec.ts).
 *
 * Time model: weekly windows are minutes from midnight UTC on a day of the week
 * (0 = Sunday … 6 = Saturday); blocked slots and generated slots are ISO-8601
 * UTC instants. Slots are generated back-to-back at the service duration.
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MINUTES_PER_DAY = 24 * 60;

/** One recurring weekly availability window. */
export interface AvailabilityWindowInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityWindowDto extends AvailabilityWindowInput {
  id: string;
}

/** Body of PUT /api/availability/windows — replaces the whole weekly schedule. */
export interface PutWindowsRequest {
  windows: AvailabilityWindowInput[];
}

/** A one-off blocked time range. */
export interface BlockedSlotDto {
  id: string;
  startsAt: string;
  endsAt: string;
}

/** Body of POST /api/availability/blocks. */
export interface CreateBlockRequest {
  startsAt: string;
  endsAt: string;
}

/** A bookable slot as GET /api/availability/slots returns it. */
export interface SlotDto {
  startsAt: string;
  endsAt: string;
}

/** "HH:MM" → minutes from midnight, or null when malformed. */
export function parseHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Minutes from midnight → "HH:MM". */
export function formatHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validate a full weekly schedule; returns a list of errors (empty when valid). */
export function validateWindows(input: unknown): string[] {
  const errors: string[] = [];
  const windows = (input as Partial<PutWindowsRequest> | null)?.windows;
  if (!Array.isArray(windows)) return ['windows must be an array'];
  windows.forEach((w, i) => {
    const v = (w ?? {}) as Partial<AvailabilityWindowInput>;
    if (!isInt(v.dayOfWeek) || v.dayOfWeek < 0 || v.dayOfWeek > 6) errors.push(`windows[${i}].dayOfWeek must be 0-6`);
    if (!isInt(v.startMinute) || v.startMinute < 0 || v.startMinute > MINUTES_PER_DAY) {
      errors.push(`windows[${i}].startMinute must be 0-${MINUTES_PER_DAY}`);
    }
    if (!isInt(v.endMinute) || v.endMinute < 0 || v.endMinute > MINUTES_PER_DAY) {
      errors.push(`windows[${i}].endMinute must be 0-${MINUTES_PER_DAY}`);
    }
    if (isInt(v.startMinute) && isInt(v.endMinute) && v.startMinute >= v.endMinute) {
      errors.push(`windows[${i}] start must be before end`);
    }
  });
  if (errors.length) return errors;
  const sorted = [...(windows as AvailabilityWindowInput[])].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.dayOfWeek === cur.dayOfWeek && cur.startMinute < prev.endMinute) {
      errors.push(`${DAY_NAMES[cur.dayOfWeek]} windows overlap`);
    }
  }
  return errors;
}

/** Validate a block request; returns a list of errors (empty when valid). */
export function validateCreateBlock(input: unknown): string[] {
  const v = (input ?? {}) as Partial<Record<keyof CreateBlockRequest, unknown>>;
  const errors: string[] = [];
  const s = typeof v.startsAt === 'string' ? Date.parse(v.startsAt) : NaN;
  const e = typeof v.endsAt === 'string' ? Date.parse(v.endsAt) : NaN;
  if (Number.isNaN(s)) errors.push('startsAt must be an ISO date-time');
  if (Number.isNaN(e)) errors.push('endsAt must be an ISO date-time');
  if (!errors.length && s >= e) errors.push('startsAt must be before endsAt');
  return errors;
}

/** True when `date` is a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/**
 * Pure slot generation: back-to-back slots of `durationMinutes` that fit
 * entirely inside a window for the weekday of `date` and do not overlap any
 * blocked range. Returns [] for an invalid date or duration.
 */
export function generateSlots(
  windows: AvailabilityWindowInput[],
  blocks: Array<Pick<BlockedSlotDto, 'startsAt' | 'endsAt'>>,
  date: string,
  durationMinutes: number,
): SlotDto[] {
  if (!isIsoDate(date) || !isInt(durationMinutes) || durationMinutes <= 0) return [];
  const dayStart = Date.parse(`${date}T00:00:00.000Z`);
  const dow = new Date(dayStart).getUTCDay();
  const ranges = blocks
    .map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)] as const)
    .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e));
  const slots: SlotDto[] = [];
  const todays = windows
    .filter((w) => w.dayOfWeek === dow)
    .sort((a, b) => a.startMinute - b.startMinute);
  for (const w of todays) {
    for (let m = w.startMinute; m + durationMinutes <= w.endMinute; m += durationMinutes) {
      const s = dayStart + m * 60_000;
      const e = s + durationMinutes * 60_000;
      if (ranges.some(([bs, be]) => s < be && bs < e)) continue;
      slots.push({ startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString() });
    }
  }
  return slots;
}
