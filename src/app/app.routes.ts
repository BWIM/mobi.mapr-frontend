import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { LandingComponent } from './landing/landing.component';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { UsersAreaComponent } from './users-area/users-area.component';
import { InvalidShareKeyComponent } from './invalid-share-key/invalid-share-key.component';

export const routes: Routes = [
  // {
  //   path: 'share/:key',
  //   component: ShareComponent,
  //   data: { public: true }
  // }, // Archived - to be migrated
  { path: 'landing', component: LandingComponent, data: { public: true } },
  { path: 'login', component: LoginComponent, data: { public: true } },
  { path: 'maintenance', component: MaintenanceComponent, data: { public: true } },
  { path: 'invalid-share-key', component: InvalidShareKeyComponent, data: { public: true } },
  { path: 'share', redirectTo: '/' , pathMatch: 'full' },
  {
    path: 'share',
    children: [
      { path: '**', redirectTo: '/' }
    ]
  },
  { path: 'users-area', component: UsersAreaComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    // canActivate: [AuthGuard] // Temporarily disabled for clean start
  },
  // Default arrival: go to landing page, which then routes based on auth/share-key state
  { path: '', redirectTo: '/landing', pathMatch: 'full' }
];
