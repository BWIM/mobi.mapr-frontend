import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { MapComponent } from '../map/map.component';
import { ProjectsComponent } from '../projects/projects.component';
import { DisplayGrid, GridsterConfig, GridsterItem, GridsterModule, GridType } from 'angular-gridster2';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, PanelModule, MapComponent, GridsterModule, ProjectsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  options: GridsterConfig;
  dashboard: Array<GridsterItem>;

  constructor() {
    this.options = {
      gridType: GridType.Fit,
      displayGrid: DisplayGrid.OnDragAndResize,
      pushItems: true,
      swap: true,
      draggable: {
        delayStart: 0,
        enabled: true,
        ignoreContentClass: 'gridster-item-content',
        dragHandleClass: 'drag-handler',
        ignoreContent: true,
        dropOverItems: false
      },
      resizable: {
        enabled: true
      }
    };

    this.dashboard = [
      { cols: 9, rows: 2, y: 0, x: 0, type: 'overview' },
      { cols: 9, rows: 4, y: 0, x: 0, type: 'map' },
      { cols: 3, rows: 6, y: 0, x: 9, type: 'details' }
    ];
  }

  ngOnInit() {
    // Zukünftige Initialisierungslogik kann hier hinzugefügt werden
  }
}
