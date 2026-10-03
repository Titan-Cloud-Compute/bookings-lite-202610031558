import { Routes } from '@angular/router';
import { authGuard } from '../../shared/auth.guard';

/** Story: set-availability — provider's /availability page inside the signed-in shell. */
export const AVAILABILITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('../../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: 'availability',
        loadComponent: () => import('./availability.component').then(m => m.AvailabilityComponent),
      },
    ],
  },
];
