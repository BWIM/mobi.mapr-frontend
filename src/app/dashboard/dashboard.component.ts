import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { MapComponent } from '../map/map.component';
import { ProjectWizardComponent } from '../projects/project-wizard/project-wizard.component';
import { DetailsSidebarComponent } from '../details-sidebar/details-sidebar.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SharedModule,
    ProjectsComponent,
    MapComponent,
    ProjectWizardComponent,
    DetailsSidebarComponent,
    LoadingSpinnerComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  detailsVisible: boolean = false;
  showGlowEffect: boolean = true;
  isLeftPinned: boolean = false;
  leftSidebarExpanded: boolean = false;
  isRightPinned: boolean = false;
  rightSidebarExpanded: boolean = false;

  constructor() {}

  ngOnInit() {
    // Entferne den Timer - der Effekt bleibt aktiv
  }

  showLeftSidebar() {
    this.leftSidebarExpanded = true;
  }

  showRightSidebar() {
    this.rightSidebarExpanded = true;
  }

  toggleLeftPin() {
    this.isLeftPinned = !this.isLeftPinned;
    this.showGlowEffect = false;
  }


  toggleRightPin() {
    this.isRightPinned = !this.isRightPinned;
    this.showGlowEffect = false;
  }


  pinRightSidebar() {
    this.rightSidebarExpanded = true;
    this.showGlowEffect = false;
    this.isRightPinned = true;
  }

  pinLeftSidebar() {
    this.leftSidebarExpanded = true;
    this.showGlowEffect = false;
    this.isLeftPinned = true;
  }

  mouseRightLeave() {
    if (!this.isRightPinned) {
      this.rightSidebarExpanded = false;
    }
  }

  mouseLeftLeave() {
    if (!this.isLeftPinned) {
      this.leftSidebarExpanded = false;
    }
  }

}
