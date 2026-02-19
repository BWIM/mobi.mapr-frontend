import { Component, signal, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { BottomComponent } from '../bottom/bottom.component';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { AuthService } from '../../auth/auth.service';
import { ProjectsService } from '../../services/project.service';
import { ProfileService } from '../../services/profile.service';
import { MapService, ContentLayerFilters } from '../../services/map.service';
import { Project } from '../../interfaces/project';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  imports: [RailComponent, LeftComponent, RightComponent, CenterComponent, BottomComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);
  private projectService = inject(ProjectsService);
  private profileService = inject(ProfileService);
  private mapService = inject(MapService);

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);

  constructor() {
    // First check: If user is not logged in and no share_key, redirect to login
    this.route.queryParams
      .pipe(takeUntilDestroyed())
      .subscribe(async params => {
        const projectId = params['project_id'];
        const shareKey = params['share_key'];

        // Check authentication tokens
        const isLoggedIn = this.authService.isLoggedIn();

        if (projectId) {
          // User is accessing with project_id (authenticated)
          if (!isLoggedIn) {
            // User has project_id but no auth tokens - redirect to login
            this.router.navigate(['/login']);
            return;
          }
          this.dashboardSessionService.setProjectId(projectId);
        } else if (shareKey) {
          // User is accessing with share_key (unauthenticated)
          // Validate share key by making preload call with defaults
          await this.validateShareKeyAndPreload(shareKey);
        } else {
          // No share_key or project_id provided
          // If user is not authenticated, redirect to login
          if (!isLoggedIn) {
            this.router.navigate(['/login']);
            return;
          }
          // If user is authenticated but no project_id, they should select one from users-area
          // But we don't redirect here to avoid infinite loops - let them access dashboard
          // The users-area will be accessible via the rail button
        }
      });
  }

  /**
   * Validates share key by fetching the project and making a preload call with defaults
   */
  private async validateShareKeyAndPreload(shareKey: string): Promise<void> {
    try {
      // First, set the share key in the session service
      this.dashboardSessionService.setShareKey(shareKey);

      // Fetch the project to validate the share key
      let project: Project | null = null;
      try {
        project = await firstValueFrom(
          this.projectService.getProjectByShareKey(shareKey)
        );
      } catch (error) {
        console.error('Error fetching project with share key:', error);
        // Redirect to invalid share key page
        this.router.navigate(['/invalid-share-key']);
        return;
      }

      if (!project) {
        // Project is null or undefined - invalid share key
        this.router.navigate(['/invalid-share-key']);
        return;
      }

      // Set the project in the service
      this.projectService.setProject(project);

      // Get profile combinations to find a default one
      let profileCombinationsResponse;
      try {
        profileCombinationsResponse = await firstValueFrom(
          this.profileService.getProfileCombinations(1, 1000)
        );
      } catch (error) {
        console.error('Error fetching profile combinations:', error);
        // If we can't get profile combinations, we can't make preload call
        // But the share key is valid, so we'll let the user continue
        // The preload will happen later when they select a profile combination
        return;
      }

      // Find a profile combination that matches the project's base_profiles
      const matchingCombination = profileCombinationsResponse.results.find(combination => {
        // Check if all profile_ids in the combination are in the project's base_profiles
        return combination.profile_ids.every(profileId => 
          project!.base_profiles.includes(profileId)
        );
      });

      if (!matchingCombination) {
        // No matching profile combination found
        // The share key is valid, but we can't make a preload call yet
        // This is okay - the user can still access the dashboard
        // The preload will happen when they select a profile combination
        console.warn('No matching profile combination found for project base_profiles');
        return;
      }

      // Make preload call with defaults
      const defaultFilters: ContentLayerFilters = {
        profile_combination_id: matchingCombination.id,
        feature_type: 'index' // Default to index
      };

      try {
        await this.mapService.checkReady(defaultFilters);
        // Preload call succeeded - share key is valid
      } catch (error) {
        console.error('Error making preload call:', error);
        // Preload call failed - share key might be invalid or there's an issue
        // Redirect to invalid share key page
        this.router.navigate(['/invalid-share-key']);
      }
    } catch (error) {
      console.error('Unexpected error validating share key:', error);
      // Fallback: redirect to invalid share key page for any unexpected errors
      this.router.navigate(['/invalid-share-key']);
    }
  }

  toggleLeftPanel() {
    this.leftPanelExpanded.update(value => !value);
  }

  toggleRightPanel() {
    this.rightPanelExpanded.update(value => !value);
  }
}
