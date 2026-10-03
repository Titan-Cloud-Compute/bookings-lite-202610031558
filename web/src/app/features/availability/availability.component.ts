import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DAY_NAMES,
  formatHhmm,
  parseHhmm,
  validateCreateBlock,
  validateWindows,
  type AvailabilityWindowInput,
  type BlockedSlotDto,
  type SlotDto,
} from '@contracts/availability';
import type { ServiceDto } from '@contracts/services';
import { ServicesApiService } from '../services/services-api.service';
import { AvailabilityApiService } from './availability-api.service';

interface DayRow {
  dayOfWeek: number;
  name: string;
  enabled: boolean;
  start: string;
  end: string;
}

/** Monday-first display order of weekdays (0 = Sunday in the contract). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Story: set-availability — weekly hours, blocked times and a bookable-slot preview. All times are UTC. */
@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="availability-page">
      <header class="page-header">
        <h1>Availability</h1>
        <p class="subtitle">Set your weekly hours and block times when you can't take bookings. Times are UTC.</p>
      </header>

      <section class="card">
        <h2>Weekly hours</h2>
        <form data-testid="availability-week" class="week" (ngSubmit)="saveWeek()">
          @if (!windowsLoaded()) {
            <p class="empty">Loading…</p>
          }
          @for (d of days; track d.dayOfWeek) {
            <div class="day-row" data-testid="availability-day" [attr.data-day]="d.dayOfWeek">
              <label class="day-name">
                <input type="checkbox" [name]="'enabled-' + d.dayOfWeek" [(ngModel)]="d.enabled" data-testid="day-enabled" />
                {{ d.name }}
              </label>
              <input type="time" [name]="'start-' + d.dayOfWeek" [(ngModel)]="d.start" [disabled]="!d.enabled"
                     data-testid="day-start" [attr.aria-label]="d.name + ' start'" />
              <span class="sep">–</span>
              <input type="time" [name]="'end-' + d.dayOfWeek" [(ngModel)]="d.end" [disabled]="!d.enabled"
                     data-testid="day-end" [attr.aria-label]="d.name + ' end'" />
            </div>
          }
          @if (weekError()) {
            <p class="error" role="alert" data-testid="week-error">{{ weekError() }}</p>
          }
          @if (weekSaved()) {
            <p class="ok" data-testid="week-saved">Weekly hours saved.</p>
          }
          <button type="submit" class="btn-primary" data-testid="week-save" [disabled]="savingWeek()">
            {{ savingWeek() ? 'Saving…' : 'Save weekly hours' }}
          </button>
        </form>
      </section>

      <section class="card">
        <h2>Blocked times</h2>
        <form data-testid="block-form" class="row-form" (ngSubmit)="addBlock()">
          <div class="form-group">
            <label for="block-date">Date</label>
            <input type="date" id="block-date" name="blockDate" [(ngModel)]="blockDate" required />
          </div>
          <div class="form-group">
            <label for="block-start">From</label>
            <input type="time" id="block-start" name="blockStart" [(ngModel)]="blockStart" required />
          </div>
          <div class="form-group">
            <label for="block-end">To</label>
            <input type="time" id="block-end" name="blockEnd" [(ngModel)]="blockEnd" required />
          </div>
          <button type="submit" class="btn-primary" data-testid="block-submit">Block time</button>
        </form>
        @if (blockError()) {
          <p class="error" role="alert" data-testid="block-error">{{ blockError() }}</p>
        }
        <ul data-testid="block-list" class="list">
          @for (b of blocks(); track b.id) {
            <li class="item" data-testid="block-item">
              <span>{{ formatRange(b) }}</span>
              <button type="button" class="btn-link" data-testid="block-remove" (click)="removeBlock(b)">Remove</button>
            </li>
          } @empty {
            <li class="empty" data-testid="block-empty">No blocked times.</li>
          }
        </ul>
      </section>

      <section class="card" data-testid="slot-preview">
        <h2>Bookable slots preview</h2>
        <form class="row-form" (ngSubmit)="preview()">
          <div class="form-group">
            <label for="preview-service">Service</label>
            <select id="preview-service" name="previewService" [(ngModel)]="previewServiceId" required>
              @for (s of services(); track s.id) {
                <option [value]="s.id">{{ s.name }} ({{ s.durationMinutes }} min)</option>
              }
            </select>
          </div>
          <div class="form-group">
            <label for="preview-date">Date</label>
            <input type="date" id="preview-date" name="previewDate" [(ngModel)]="previewDate" required />
          </div>
          <button type="submit" class="btn-primary" data-testid="preview-submit">Show slots</button>
        </form>
        @if (previewError()) {
          <p class="error" role="alert" data-testid="preview-error">{{ previewError() }}</p>
        }
        @if (slots(); as list) {
          <ul data-testid="slot-list" class="slots">
            @for (s of list; track s.startsAt) {
              <li class="slot" data-testid="slot-item">{{ s.startsAt.slice(11, 16) }}</li>
            } @empty {
              <li class="empty" data-testid="slot-empty">No bookable slots on this day.</li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [`
    .availability-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-lg, 1.125rem); color: var(--color-text-primary); margin: 0 0 1rem; }
    .subtitle { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .card { background: white; border-radius: var(--radius-card); border: 1px solid var(--color-border); padding: 2rem; margin-bottom: 1.5rem; }
    .week { display: flex; flex-direction: column; gap: 0.5rem; }
    .day-row { display: flex; align-items: center; gap: 0.75rem; }
    .day-name { width: 8rem; display: flex; align-items: center; gap: 0.5rem; font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary); }
    .row-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-group label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary); }
    input[type="time"], input[type="date"], select { padding: 0.625rem 0.75rem; font-size: var(--font-size-input, 1rem); border: 1px solid var(--color-gray-300); border-radius: var(--radius-btn); background: white; min-height: 44px; }
    .error { color: var(--color-error, #b91c1c); font-size: var(--font-size-sm); margin: 0.5rem 0 0; }
    .ok, .empty, .sep { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    .list, .slots { list-style: none; margin: 1rem 0 0; padding: 0; }
    .item { display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border); }
    .slots { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .slot { padding: 0.375rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-btn); }
    .btn-link { background: none; border: none; color: var(--color-primary); cursor: pointer; min-height: 44px; }
  `],
})
export class AvailabilityComponent implements OnInit {
  private readonly api = inject(AvailabilityApiService);
  private readonly servicesApi = inject(ServicesApiService);

  readonly days: DayRow[] = DISPLAY_ORDER.map((d) => ({
    dayOfWeek: d,
    name: DAY_NAMES[d],
    enabled: false,
    start: '09:00',
    end: '17:00',
  }));

  blockDate = '';
  blockStart = '';
  blockEnd = '';
  previewServiceId = '';
  previewDate = '';

  readonly blocks = signal<BlockedSlotDto[]>([]);
  readonly services = signal<ServiceDto[]>([]);
  readonly slots = signal<SlotDto[] | null>(null);
  readonly windowsLoaded = signal(false);
  readonly savingWeek = signal(false);
  readonly weekSaved = signal(false);
  readonly weekError = signal<string | null>(null);
  readonly blockError = signal<string | null>(null);
  readonly previewError = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadWindows();
    void this.loadBlocks();
    void this.loadServices();
  }

  private async loadWindows(): Promise<void> {
    try {
      const rows = await this.api.listWindows();
      for (const w of Array.isArray(rows) ? rows : []) {
        const day = this.days.find((d) => d.dayOfWeek === w.dayOfWeek);
        if (!day || day.enabled) continue;
        day.enabled = true;
        day.start = formatHhmm(w.startMinute);
        day.end = formatHhmm(w.endMinute);
      }
    } catch {
      this.weekError.set('Could not load your weekly hours.');
    } finally {
      this.windowsLoaded.set(true);
    }
  }

  private async loadBlocks(): Promise<void> {
    try {
      const rows = await this.api.listBlocks();
      this.blocks.set(Array.isArray(rows) ? rows : []);
    } catch {
      this.blockError.set('Could not load blocked times.');
    }
  }

  private async loadServices(): Promise<void> {
    try {
      const rows = await this.servicesApi.listMine();
      const list = Array.isArray(rows) ? rows : [];
      this.services.set(list);
      if (!this.previewServiceId && list.length) this.previewServiceId = list[0].id;
    } catch {
      this.services.set([]);
    }
  }

  async saveWeek(): Promise<void> {
    this.weekSaved.set(false);
    const windows: AvailabilityWindowInput[] = [];
    for (const d of this.days.filter((x) => x.enabled)) {
      const startMinute = parseHhmm(d.start);
      const endMinute = parseHhmm(d.end);
      if (startMinute === null || endMinute === null) {
        this.weekError.set(`${d.name}: enter a start and end time.`);
        return;
      }
      windows.push({ dayOfWeek: d.dayOfWeek, startMinute, endMinute });
    }
    const errors = validateWindows({ windows });
    if (errors.length) {
      this.weekError.set(errors.map((e) => e.replace(/windows\[(\d+)\]/, (_, i) => DAY_NAMES[windows[+i].dayOfWeek])).join('; '));
      return;
    }
    this.weekError.set(null);
    this.savingWeek.set(true);
    try {
      await this.api.replaceWindows(windows);
      this.weekSaved.set(true);
    } catch (e: unknown) {
      const status = (e as { status?: number } | null)?.status;
      this.weekError.set(status === 403 ? 'Only providers can set availability.' : 'Could not save weekly hours.');
    } finally {
      this.savingWeek.set(false);
    }
  }

  async addBlock(): Promise<void> {
    if (!this.blockDate || !this.blockStart || !this.blockEnd) {
      this.blockError.set('Enter a date, start and end time.');
      return;
    }
    const body = {
      startsAt: `${this.blockDate}T${this.blockStart}:00.000Z`,
      endsAt: `${this.blockDate}T${this.blockEnd}:00.000Z`,
    };
    const errors = validateCreateBlock(body);
    if (errors.length) {
      this.blockError.set(errors.join('; '));
      return;
    }
    this.blockError.set(null);
    try {
      await this.api.createBlock(body);
      this.blockStart = '';
      this.blockEnd = '';
      await this.loadBlocks();
    } catch (e: unknown) {
      const status = (e as { status?: number } | null)?.status;
      this.blockError.set(status === 403 ? 'Only providers can block time.' : 'Could not block this time.');
    }
  }

  async removeBlock(b: BlockedSlotDto): Promise<void> {
    try {
      await this.api.deleteBlock(b.id);
      this.blocks.update((list) => list.filter((x) => x.id !== b.id));
    } catch {
      this.blockError.set('Could not remove this blocked time.');
    }
  }

  async preview(): Promise<void> {
    if (!this.previewServiceId || !this.previewDate) {
      this.previewError.set('Choose a service and a date.');
      return;
    }
    this.previewError.set(null);
    try {
      const rows = await this.api.slots(this.previewServiceId, this.previewDate);
      this.slots.set(Array.isArray(rows) ? rows : []);
    } catch {
      this.slots.set(null);
      this.previewError.set('Could not load bookable slots.');
    }
  }

  formatRange(b: BlockedSlotDto): string {
    return `${b.startsAt.slice(0, 10)} ${b.startsAt.slice(11, 16)}–${b.endsAt.slice(11, 16)} UTC`;
  }
}
