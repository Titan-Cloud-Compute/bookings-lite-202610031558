import { Routes } from '@angular/router';
import { SERVICES_ROUTES } from './services/services.routes';
import { AVAILABILITY_ROUTES } from './availability/availability.routes';

/**
 * Feature route registry.
 *
 * Each story appends its Angular routes to this array.
 * app.routes.ts spreads FEATURE_ROUTES before the wildcard catch-all so new
 * feature routes are picked up automatically.
 *
 * Example (in features/my-feature/my-feature.routes.ts):
 *
 *   import { FEATURE_ROUTES } from '../index';
 *   FEATURE_ROUTES.push({ path: 'my-feature', loadComponent: () => ... });
 *
 * Or add routes here directly.
 */
export const FEATURE_ROUTES: Routes = [...SERVICES_ROUTES, ...AVAILABILITY_ROUTES];
