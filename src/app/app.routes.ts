import { Routes } from '@angular/router';

// Every page is lazy-loaded so the landing/login pages do not download the map stack
// (MapLibre, Chart.js, dashboard layout) up front.
export const routes: Routes = [
  // {
  //   path: 'share/:key',
  //   component: ShareComponent,
  //   data: { public: true }
  // }, // Archived - to be migrated
  {
    path: 'landing',
    loadComponent: () => import('./landing/landing.component').then(m => m.LandingComponent),
    data: { public: true },
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent),
    data: { public: true },
  },
  {
    path: 'maintenance',
    loadComponent: () => import('./maintenance/maintenance.component').then(m => m.MaintenanceComponent),
    data: { public: true },
  },
  {
    path: 'invalid-share-key',
    loadComponent: () =>
      import('./invalid-share-key/invalid-share-key.component').then(m => m.InvalidShareKeyComponent),
    data: { public: true },
  },
  { path: 'share', redirectTo: '/' , pathMatch: 'full' },
  {
    path: 'share',
    children: [
      { path: '**', redirectTo: '/' }
    ]
  },
  {
    path: 'users-area',
    loadComponent: () => import('./users-area/users-area.component').then(m => m.UsersAreaComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./layout/dashboard/dashboard.component').then(m => m.DashboardComponent),
    // canActivate: [AuthGuard] // Temporarily disabled for clean start
  },
  // Default arrival: go to landing page, which then routes based on auth/share-key state
  { path: '', redirectTo: '/landing', pathMatch: 'full' }
];
