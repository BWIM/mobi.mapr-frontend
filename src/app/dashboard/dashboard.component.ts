import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  Gridster, 
  GridsterItem, 
  GridsterConfig, 
  GridsterItemConfig,
  GridType,
  CompactType,
  DisplayGrid
} from 'angular-gridster2';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    Gridster,
    GridsterItem,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  options: GridsterConfig = {
    gridType: GridType.Fit,
    compactType: CompactType.None,
    margin: 10,
    outerMargin: true,
    outerMarginTop: null,
    outerMarginRight: null,
    outerMarginBottom: null,
    outerMarginLeft: null,
    useTransformPositioning: true,
    mobileBreakpoint: 640,
    useBodyForBreakpoint: false,
    minCols: 1,
    maxCols: 100,
    minRows: 1,
    maxRows: 100,
    maxItemCols: 100,
    minItemCols: 1,
    maxItemRows: 100,
    minItemRows: 1,
    maxItemArea: 2500,
    minItemArea: 1,
    defaultItemCols: 1,
    defaultItemRows: 1,
    fixedColWidth: 105,
    fixedRowHeight: 105,
    keepFixedHeightInMobile: false,
    keepFixedWidthInMobile: false,
    scrollSensitivity: 10,
    scrollSpeed: 20,
    enableEmptyCellClick: false,
    enableEmptyCellContextMenu: false,
    enableEmptyCellDrop: false,
    enableEmptyCellDrag: false,
    enableOccupiedCellDrop: false,
    emptyCellDragMaxCols: 50,
    emptyCellDragMaxRows: 50,
    ignoreMarginInRow: false,
    draggable: {
      enabled: true,
    },
    resizable: {
      enabled: true,
    },
    swap: false,
    pushItems: true,
    disablePushOnDrag: false,
    disablePushOnResize: false,
    pushDirections: { north: true, east: true, south: true, west: true },
    pushResizeItems: false,
    displayGrid: DisplayGrid.OnDragAndResize,
    disableWindowResize: false,
    disableWarnings: false,
    scrollToNewItems: false,
  };

  dashboard: GridsterItemConfig[] = [
    { cols: 2, rows: 2, y: 0, x: 0, id: 'welcome' },
    { cols: 1, rows: 1, y: 0, x: 2, id: 'stats' },
  ];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    // Load saved dashboard layout from service or localStorage
    this.loadDashboardLayout();
  }

  private loadDashboardLayout(): void {
    // TODO: Load from service or localStorage
    const saved = localStorage.getItem('dashboard-layout');
    if (saved) {
      try {
        this.dashboard = JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to load dashboard layout', e);
      }
    }
  }

  saveDashboardLayout(): void {
    localStorage.setItem('dashboard-layout', JSON.stringify(this.dashboard));
  }

  changedOptions(): void {
    this.options = Object.assign({}, this.options);
  }

  removeItem($event: MouseEvent | TouchEvent, item: GridsterItemConfig): void {
    $event.preventDefault();
    $event.stopPropagation();
    this.dashboard.splice(this.dashboard.indexOf(item), 1);
    this.saveDashboardLayout();
  }

  addItem(): void {
    const lastItem = this.dashboard.length > 0 ? this.dashboard[this.dashboard.length - 1] : null;
    const lastId = lastItem 
      ? (typeof lastItem['id'] === 'number' 
          ? (lastItem['id'] as number) + 1 
          : this.dashboard.length + 1)
      : 1;
    this.dashboard.push({
      cols: 2,
      rows: 2,
      y: 0,
      x: 0,
      id: lastId,
    });
    this.saveDashboardLayout();
  }
}
