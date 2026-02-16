import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { LandingComponent } from './landing/landing.component';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { UsersAreaComponent } from './users-area/users-area.component';

export const routes: Routes = [
  // {
  //   path: 'share/:key',
  //   component: ShareComponent,
  //   data: { public: true }
  // }, // Archived - to be migrated
  { path: 'landing', component: LandingComponent, data: { public: true } },
  { path: 'login', component: LoginComponent, data: { public: true } },
  { path: 'maintenance', component: MaintenanceComponent, data: { public: true } },
  { path: 'users-area', component: UsersAreaComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    // canActivate: [AuthGuard] // Temporarily disabled for clean start
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' } // Changed default to dashboard
];
