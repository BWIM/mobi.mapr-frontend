import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { DetailsSidebarComponent } from '../details-sidebar/details-sidebar.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { MapV2Component } from '../map-v2/map-v2.component';
import { DashboardService } from './dashboard.service';
import { MapV2Service } from '../map-v2/map-v2.service';
import { DashboardLayoutComponent } from '../layout/dashboard-layout/dashboard-layout.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SharedModule,
    ProjectsComponent,
    MapV2Component,
    DetailsSidebarComponent,
    LoadingSpinnerComponent,
    DashboardLayoutComponent,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  constructor(private dashboardService: DashboardService, private mapService: MapV2Service) {}

  ngOnInit(): void {
    // Component initialization if needed
  }

  toggleRightSidebar() {
    this.dashboardService.toggleRightSidebarExpanded();
  }

  zoomToFeatures() {
    this.mapService.zoomToFeatures();
  }
}
