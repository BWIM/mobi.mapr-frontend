import { Component, signal, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { BottomComponent } from '../bottom/bottom.component';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [RailComponent, LeftComponent, RightComponent, CenterComponent, BottomComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);

  ngOnInit(): void {
    // Subscribe to query parameters to get project_id or share_key
    this.route.queryParams
      .pipe(takeUntilDestroyed())
      .subscribe(params => {
        const projectId = params['project_id'];
        const shareKey = params['share_key'];

        if (projectId) {
          // User is accessing with project_id (authenticated)
          this.dashboardSessionService.setProjectId(projectId);
        } else if (shareKey) {
          // User is accessing with share_key (unauthenticated)
          this.dashboardSessionService.setShareKey(shareKey);
        } else {
          // No share_key or project_id provided
          // If user is not authenticated, redirect to login
          if (!this.authService.isLoggedIn()) {
            this.router.navigate(['/login']);
          }
          // If user is authenticated but no project_id, they should select one from users-area
          // But we don't redirect here to avoid infinite loops - let them access dashboard
          // The users-area will be accessible via the rail button
        }
      });
  }

  toggleLeftPanel() {
    this.leftPanelExpanded.update(value => !value);
  }

  toggleRightPanel() {
    this.rightPanelExpanded.update(value => !value);
  }
}
