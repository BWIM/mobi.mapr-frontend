import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../dashboard/dashboard.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.css',
})
export class DashboardLayoutComponent {
  constructor(public dashboardService: DashboardService) {}
}
