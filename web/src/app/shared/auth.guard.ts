import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { AuthRole } from '@contracts/auth';
import { AuthService } from './auth.service';

/**
 * Blocks signed-out visitors from the signed-in shell. They are sent to the
 * sign-in page carrying the destination as `returnUrl`, which the login page
 * honours after a successful sign-in.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Restricts a route to the given roles. Signed-out visitors go to sign-in
 * (with `returnUrl`); signed-in users without a permitted role go to the dashboard.
 */
export function roleGuard(...roles: AuthRole[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    const allowed = (roles as readonly string[]).includes(user.role)
      || (user.role === 'SUPER_ADMIN' && roles.includes('ADMIN'));
    return allowed ? true : router.createUrlTree(['/dashboard']);
  };
}
