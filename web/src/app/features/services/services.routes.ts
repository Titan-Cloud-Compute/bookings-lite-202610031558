import { Routes } from '@angular/router';
import { authGuard } from '../../shared/auth.guard';

/** Story: create-service — provider's /services page inside the signed-in shell. */
export const SERVICES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('../../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: 'services',
        loadComponent: () => import('./services.component').then(m => m.ServicesComponent),
      },
    ],
  },
];
