import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AuthGuard } from './auth/auth.guard';
import { ShareComponent } from './share/share.component';
import { LandingComponent } from './landing/landing.component';

export const routes: Routes = [
  {
    path: 'share/:key',
    component: ShareComponent,
    data: { public: true }
  },
  { path: 'landing', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard]
  },
  { path: '', redirectTo: '/landing', pathMatch: 'full' }
];
