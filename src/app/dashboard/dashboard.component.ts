import { Component, OnInit, HostListener } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { DetailsSidebarComponent } from '../details-sidebar/details-sidebar.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { MapV2Component } from '../map-v2/map-v2.component';
import { TutorialService } from '../tutorial/tutorial.service';
import { DashboardService } from './dashboard.service';
import { MapV2Service } from '../map-v2/map-v2.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SharedModule,
    ProjectsComponent,
    MapV2Component,
    DetailsSidebarComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  detailsVisible: boolean = false;
  showGlowEffect: boolean = true;
  isLeftPinned: boolean = true;
  leftSidebarExpanded: boolean = true;
  isRightPinned: boolean = false;
  rightSidebarExpanded: boolean = false;
  isMobile: boolean = false;
  isSmallMobile: boolean = false;

  constructor(private tutorialService: TutorialService, private dashboardService: DashboardService, private mapService: MapV2Service) {
    this.checkMobile();
  }

  ngOnInit(): void {
    // s
    this.dashboardService.rightSidebarExpanded$.subscribe((expanded) => {
      this.rightSidebarExpanded = expanded;
    });
    this.dashboardService.leftSidebarExpanded$.subscribe((expanded) => {
      this.leftSidebarExpanded = expanded;
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkMobile();
  }

  private checkMobile(): void {
    this.isMobile = window.innerWidth < 768;
    this.isSmallMobile = window.innerWidth <= 480;
  }

  showLeftSidebar() {
    this.leftSidebarExpanded = true;
  }

  showRightSidebar() {
    this.dashboardService.toggleRightSidebarExpanded();
  }

  toggleSidebar() {
    this.dashboardService.toggleRightSidebarExpanded();
  }

  zoomToFeatures() {
    this.mapService.zoomToFeatures();
  }

}
