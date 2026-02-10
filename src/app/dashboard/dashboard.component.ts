import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { IconRailComponent } from '../components/icon-rail/icon-rail.component';
import { FilterViewComponent } from '../components/filter-view/filter-view.component';
import { MapComponent } from '../components/map/map.component';
import { StatsComponent } from '../components/stats/stats.component';
import { AnalyzeComponent } from '../components/analyze/analyze.component';
import { DashboardLayoutComponent } from '../layout/dashboard-layout/dashboard-layout.component';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    DashboardLayoutComponent,
    IconRailComponent,
    FilterViewComponent,
    MapComponent,
    StatsComponent,
    AnalyzeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    // TODO: Initialize dashboard state
  }
}
