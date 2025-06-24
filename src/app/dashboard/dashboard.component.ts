import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { DetailsSidebarComponent } from '../details-sidebar/details-sidebar.component';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { MapV2Component } from '../map-v2/map-v2.component';
import { TutorialService } from '../tutorial/tutorial.service';

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

  constructor(private tutorialService: TutorialService) {}

  ngOnInit(): void {
    this.tutorialService.getTutorialStatus().subscribe((status) => {
      if (status) {
        this.tutorialService.startTutorial('dashboard');
      }
    });
  }

  showLeftSidebar() {
    this.leftSidebarExpanded = true;
  }

  showRightSidebar() {
    this.rightSidebarExpanded = true;
  }

}
