import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { LandingComponent } from './landing/landing.component';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { UsersAreaComponent } from './users-area/users-area.component';
import { InvalidShareKeyComponent } from './invalid-share-key/invalid-share-key.component';
import { ShareRedirectComponent } from './share-redirect/share-redirect.component';

export const routes: Routes = [
  // Redirect /share routes to external URL
  { path: 'share/:key', component: ShareRedirectComponent, data: { public: true } },
  { path: 'share', component: ShareRedirectComponent, data: { public: true } },
  { path: 'landing', component: LandingComponent, data: { public: true } },
  { path: 'login', component: LoginComponent, data: { public: true } },
  { path: 'maintenance', component: MaintenanceComponent, data: { public: true } },
  { path: 'invalid-share-key', component: InvalidShareKeyComponent, data: { public: true } },
  { path: 'users-area', component: UsersAreaComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    // canActivate: [AuthGuard] // Temporarily disabled for clean start
  },
  // Default arrival: go to landing page, which then routes based on auth/share-key state
  { path: '', redirectTo: '/landing', pathMatch: 'full' }
];
