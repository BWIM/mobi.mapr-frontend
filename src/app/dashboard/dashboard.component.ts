import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ProjectsComponent } from '../projects/projects.component';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SharedModule,
    ProjectsComponent,
    MapComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  sidebarVisible: boolean = true;
  detailsVisible: boolean = false;
  projectsVisible: boolean = false;
  showGlowEffect: boolean = true;
  
  get mainPanelSize(): number {
    if (this.sidebarVisible && this.detailsVisible) return 60;
    if (!this.sidebarVisible && !this.detailsVisible) return 100;
    return 80;
  }

  constructor() {}

  ngOnInit() {
    // Entferne den Timer - der Effekt bleibt aktiv
  }

  showProjects() {
    this.projectsVisible = !this.projectsVisible;
    this.showGlowEffect = false;  // Deaktiviere den Glüheffekt beim ersten Klick
  }

  showDetails() {
    this.detailsVisible = !this.detailsVisible;
  }
}
