import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { validateCreateService, type ServiceDto } from '@contracts/services';
import { ServicesApiService } from './services-api.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="services-page">
      <header class="page-header">
        <h1>Services</h1>
        <p class="subtitle">Create the services clients can book.</p>
      </header>

      <section class="card">
        <h2>Add a service</h2>
        <form data-testid="service-form" class="service-form" (ngSubmit)="create()">
          <div class="form-group">
            <label for="service-name">Name</label>
            <input type="text" id="service-name" name="name" [(ngModel)]="name" required maxlength="120" placeholder="e.g. Haircut" />
          </div>
          <div class="form-group">
            <label for="service-duration">Duration (minutes)</label>
            <input type="number" id="service-duration" name="duration" [(ngModel)]="duration" required min="1" step="1" />
          </div>
          <div class="form-group">
            <label for="service-price">Price</label>
            <input type="number" id="service-price" name="price" [(ngModel)]="price" required min="0" step="0.01" />
          </div>
          @if (error()) {
            <p class="error" role="alert" data-testid="service-error">{{ error() }}</p>
          }
          <button type="submit" class="btn-primary" data-testid="service-submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Create service' }}
          </button>
        </form>
      </section>

      <section class="card">
        <h2>My services</h2>
        <ul data-testid="service-list" class="service-list">
          @for (s of services(); track s.id) {
            <li class="service-item" data-testid="service-item">
              <span class="service-name">{{ s.name }}</span>
              <span class="service-meta">{{ s.durationMinutes }} min · {{ formatPrice(s.priceCents) }}</span>
            </li>
          } @empty {
            <li class="empty" data-testid="service-empty">{{ loading() ? 'Loading…' : 'No services yet.' }}</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .services-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-lg, 1.125rem); color: var(--color-text-primary); margin: 0 0 1rem; }
    .subtitle { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .card { background: white; border-radius: var(--radius-card); border: 1px solid var(--color-border); padding: 2rem; margin-bottom: 1.5rem; }
    .service-form { display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-group label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary); }
    .form-group input { padding: 0.625rem 0.75rem; font-size: var(--font-size-input, 1rem); border: 1px solid var(--color-gray-300); border-radius: var(--radius-btn); background: white; min-height: 44px; }
    .error { color: var(--color-error, #b91c1c); font-size: var(--font-size-sm); margin: 0; }
    .service-list { list-style: none; margin: 0; padding: 0; }
    .service-item { display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border); }
    .service-meta, .empty { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
  `],
})
export class ServicesComponent implements OnInit {
  private readonly api = inject(ServicesApiService);

  name = '';
  duration: number | null = 30;
  price: number | null = null;

  readonly services = signal<ServiceDto[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.api.listMine();
      this.services.set(Array.isArray(rows) ? rows : []);
    } catch {
      this.error.set('Could not load your services.');
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const body = {
      name: this.name.trim(),
      durationMinutes: Number(this.duration),
      priceCents: Math.round(Number(this.price) * 100),
    };
    if (this.price === null || this.price === undefined || (this.price as unknown) === '') {
      this.error.set('Price is required.');
      return;
    }
    const errors = validateCreateService(body);
    if (errors.length) {
      this.error.set(errors.join('; '));
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.api.create(body);
      this.name = '';
      this.duration = 30;
      this.price = null;
      await this.refresh();
    } catch (e: unknown) {
      const status = (e as { status?: number } | null)?.status;
      this.error.set(status === 403 ? 'Only providers can create services.' : 'Could not create the service.');
    } finally {
      this.saving.set(false);
    }
  }

  formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}
