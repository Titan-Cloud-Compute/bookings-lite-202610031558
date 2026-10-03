import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  generateSlots,
  parseHhmm,
  formatHhmm,
  validateCreateBlock,
  validateWindows,
} from './index';

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05';

describe('@contracts/availability', () => {
  it('web and backend copies of the contract are identical', () => {
    const backend = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const web = readFileSync(
      resolve(__dirname, '../../../../../web/src/shared/contracts/availability/index.ts'),
      'utf8',
    );
    expect(web).toBe(backend);
  });

  it('schema.prisma declares AvailabilityWindow and BlockedSlot', () => {
    const schema = readFileSync(resolve(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
    const w = schema.match(/model\s+AvailabilityWindow\s*\{([^}]*)\}/);
    const b = schema.match(/model\s+BlockedSlot\s*\{([^}]*)\}/);
    expect(w).not.toBeNull();
    expect(b).not.toBeNull();
    for (const f of ['providerId', 'dayOfWeek', 'startMinute', 'endMinute']) expect(w![1]).toMatch(new RegExp(`\\b${f}\\b`));
    for (const f of ['providerId', 'startsAt', 'endsAt']) expect(b![1]).toMatch(new RegExp(`\\b${f}\\b`));
  });

  it('parses and formats HH:MM', () => {
    expect(parseHhmm('09:00')).toBe(540);
    expect(parseHhmm('24:00')).toBe(1440);
    expect(parseHhmm('9:61')).toBeNull();
    expect(parseHhmm('x')).toBeNull();
    expect(formatHhmm(630)).toBe('10:30');
  });

  it('validates windows: range, start<end, no overlap', () => {
    expect(validateWindows({ windows: [] })).toEqual([]);
    expect(validateWindows({ windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }] })).toEqual([]);
    expect(validateWindows({ windows: [{ dayOfWeek: 7, startMinute: 0, endMinute: 60 }] })).toHaveLength(1);
    expect(validateWindows({ windows: [{ dayOfWeek: 1, startMinute: 720, endMinute: 540 }] })).toHaveLength(1);
    expect(
      validateWindows({
        windows: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
          { dayOfWeek: 1, startMinute: 700, endMinute: 800 },
        ],
      }),
    ).toEqual(['Monday windows overlap']);
    expect(
      validateWindows({
        windows: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
          { dayOfWeek: 1, startMinute: 720, endMinute: 800 },
          { dayOfWeek: 2, startMinute: 540, endMinute: 720 },
        ],
      }),
    ).toEqual([]);
    expect(validateWindows(null)).toEqual(['windows must be an array']);
  });

  it('validates blocks', () => {
    expect(validateCreateBlock({ startsAt: `${MONDAY}T10:00:00.000Z`, endsAt: `${MONDAY}T10:30:00.000Z` })).toEqual([]);
    expect(validateCreateBlock({ startsAt: `${MONDAY}T10:30:00.000Z`, endsAt: `${MONDAY}T10:00:00.000Z` })).toHaveLength(1);
    expect(validateCreateBlock({})).toHaveLength(2);
  });

  it('Monday 09:00-12:00 with 10:00-10:30 blocked yields only in-window, unblocked 30-minute slots', () => {
    const slots = generateSlots(
      [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }],
      [{ startsAt: `${MONDAY}T10:00:00.000Z`, endsAt: `${MONDAY}T10:30:00.000Z` }],
      MONDAY,
      30,
    );
    const starts = slots.map((s) => s.startsAt.slice(11, 16));
    expect(starts).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30']);
    expect(starts).not.toContain('10:00');
    for (const s of slots) {
      expect(s.startsAt >= `${MONDAY}T09:00`).toBe(true);
      expect(s.endsAt <= `${MONDAY}T12:00:00.000Z`).toBe(true);
    }
  });

  it('offers nothing on a day without windows, or for invalid input', () => {
    const w = [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }];
    expect(generateSlots(w, [], '2026-10-06', 30)).toEqual([]);
    expect(generateSlots(w, [], 'bad', 30)).toEqual([]);
    expect(generateSlots(w, [], MONDAY, 0)).toEqual([]);
  });

  it('a slot partially overlapping a block is excluded', () => {
    const slots = generateSlots(
      [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }],
      [{ startsAt: `${MONDAY}T10:15:00.000Z`, endsAt: `${MONDAY}T10:45:00.000Z` }],
      MONDAY,
      60,
    );
    expect(slots.map((s) => s.startsAt.slice(11, 16))).toEqual(['09:00', '11:00']);
  });
});
