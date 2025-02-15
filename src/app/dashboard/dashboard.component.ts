import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { MapComponent } from '../map/map.component';
import { ProjectWizardComponent } from '../projects/project-wizard/project-wizard.component';
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SharedModule,
    ProjectsComponent,
    MapComponent,
    ProjectWizardComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  sidebarVisible: boolean = false;
  detailsVisible: boolean = false;
  showGlowEffect: boolean = true;
  isPinned: boolean = false;
  sidebarExpanded: boolean = false;

  constructor() {}

  ngOnInit() {
    // Entferne den Timer - der Effekt bleibt aktiv
  }

  showSidebar() {
    this.sidebarExpanded = true;
  }

  togglePin() {
    this.isPinned = !this.isPinned;
    this.showGlowEffect = false;
  }

  showDetails() {
    this.detailsVisible = !this.detailsVisible;
  }

  mouseLeave() {
    console.log('mouseLeave');
    if (!this.isPinned) {
      this.sidebarExpanded = false;
    }
  }

  pinSidebar() {
    this.sidebarExpanded = true;
    this.showGlowEffect = false;
    this.isPinned = true;
  }
}
