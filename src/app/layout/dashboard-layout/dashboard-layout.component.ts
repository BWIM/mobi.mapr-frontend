import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { DashboardService } from '../../dashboard/dashboard.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.css'
})
export class DashboardLayoutComponent implements OnInit {
  @ViewChild('rightSidenav') rightSidenav!: MatSidenav;
  
  isHandset$!: Observable<boolean>;

  constructor(
    private breakpointObserver: BreakpointObserver,
    public dashboardService: DashboardService
  ) {
    // Initialize observable in constructor after breakpointObserver is injected
    this.isHandset$ = this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(
        map(result => result.matches),
        shareReplay()
      );
  }

  ngOnInit(): void {
    // Listen to right sidebar state changes
    this.dashboardService.rightSidebarExpanded$.subscribe((expanded) => {
      if (this.rightSidenav) {
        if (expanded) {
          this.rightSidenav.open();
        } else {
          this.rightSidenav.close();
        }
      }
    });
  }

  onRightSidenavChange(opened: boolean): void {
    this.dashboardService.setRightSidebarExpanded(opened);
  }
}
