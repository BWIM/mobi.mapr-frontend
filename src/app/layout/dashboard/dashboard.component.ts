import { Component, signal, inject, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { AuthService } from '../../auth/auth.service';
import { ProjectsService } from '../../services/project.service';
import { ProfileService } from '../../services/profile.service';
import { MapService, ContentLayerFilters } from '../../services/map.service';
import { FilterConfigService } from '../../services/filter-config.service';
import { Project } from '../../interfaces/project';
import { firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MobileFilterPanelComponent } from '../mobile-filter-panel/mobile-filter-panel.component';
import { GeoJsonDownloadDialogComponent, GeoJsonDownloadDialogData } from '../left/geojson-download-dialog/geojson-download-dialog.component';

@Component({
  selector: 'app-dashboard',
  imports: [RailComponent, LeftComponent, RightComponent, CenterComponent, TranslateModule, MatIcon, MobileFilterPanelComponent],
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
  private filterConfigService = inject(FilterConfigService);
  private dialog = inject(MatDialog);
  private breakpointObserver = inject(BreakpointObserver);

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);
  mobileFilterExpanded = signal(false);
  private hasInitialized = false;
  private currentProjectIdentifier: string | null = null;

  // Mobile breakpoint detection (768px = md breakpoint)
  isMobile = toSignal(
    this.breakpointObserver.observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(map(result => result.matches)),
    { initialValue: false }
  );

  constructor() {
    // Automatically collapse right panel when on mobile
    effect(() => {
      if (this.isMobile()) {
        this.rightPanelExpanded.set(false);
      }
    });
    // First check: If user is not logged in and no share_key, redirect to login
    this.route.queryParams
      .pipe(
        takeUntilDestroyed(),
        distinctUntilChanged((prev, curr) => 
          prev['project_id'] === curr['project_id'] && 
          prev['share_key'] === curr['share_key']
        )
      )
      .subscribe(async params => {
        const projectId = params['project_id'];
        const shareKey = params['share_key'];

        // Check authentication tokens
        const isLoggedIn = this.authService.isLoggedIn();

        // Check if there's already a project or share key in the session service
        const existingProjectId = this.dashboardSessionService.getProjectId();
        const existingShareKey = this.dashboardSessionService.getShareKey();

        // Check current route to prevent redirect loops
        const currentUrl = this.router.url.split('?')[0];

        // Determine the new project identifier
        const newProjectIdentifier = projectId || shareKey || existingProjectId || existingShareKey || null;
        
        // Check if project has changed
        const projectChanged = this.currentProjectIdentifier !== newProjectIdentifier;
        if (projectChanged && this.currentProjectIdentifier !== null) {
          // Clear the old project when switching to a new one
          this.projectService.clearProject();
        }
        if (projectChanged) {
          // Reset initialization state when project changes
          this.hasInitialized = false;
          this.currentProjectIdentifier = newProjectIdentifier;
        }

        if (projectId) {
          // User is accessing with project_id (authenticated)
          if (!isLoggedIn) {
            // User has project_id but no auth tokens - redirect to login
            if (currentUrl !== '/login') {
              this.router.navigate(['/login']);
            }
            return;
          }
          
          // Set project ID in session service (this will clear share_key if present)
          this.dashboardSessionService.setProjectId(projectId);
          
          // Load the project if it changed or hasn't been loaded yet
          if (projectChanged || !this.projectService.isInitialized()) {
            await this.loadProjectById(projectId);
          }
          
          this.hasInitialized = true;
        } else if (shareKey) {
          // User is accessing with share_key (unauthenticated)
          // Validate share key by making preload call with defaults
          await this.validateShareKeyAndPreload(shareKey);
          this.hasInitialized = true;
        } else if (existingProjectId) {
          // No project_id or share_key in query params, but there's one in session
          // User already has a project selected, allow access
          // Load the project if it changed or hasn't been loaded yet
          if (projectChanged || !this.projectService.isInitialized()) {
            await this.loadProjectById(existingProjectId);
          }
          this.hasInitialized = true;
        } else if (existingShareKey) {
          // No project_id or share_key in query params, but there's a share key in session
          // User already has a share key, allow access
          // Load the project if it changed or hasn't been loaded yet
          if (projectChanged || !this.projectService.isInitialized()) {
            await this.validateShareKeyAndPreload(existingShareKey);
          }
          this.hasInitialized = true;
        } else {
          // No project_id or share_key in query params AND none in session service
          // Only redirect on initial load, not on subsequent query param changes
          if (!this.hasInitialized) {
            if (isLoggedIn) {
              // User is authenticated but has no project - redirect to users-area to select one
              if (currentUrl !== '/users-area') {
                this.router.navigate(['/users-area']);
              }
              return;
            } else {
              // User is not authenticated and has no share key - redirect to landing
              if (currentUrl !== '/landing') {
                this.router.navigate(['/landing']);
              }
              return;
            }
          }
        }
      });
  }

  /**
   * Loads a project by ID (for authenticated users)
   */
  private async loadProjectById(projectId: string): Promise<void> {
    try {
      const project = await firstValueFrom(
        this.projectService.getProjectById(Number(projectId))
      );
      
      if (!project) {
        console.error('Project not found:', projectId);
        // Redirect to users-area if project not found
        this.router.navigate(['/users-area']);
        return;
      }

      // Set the project in the service
      this.projectService.setProject(project);
    } catch (error) {
      console.error('Error loading project by ID:', error);
      // Redirect to users-area on error
      this.router.navigate(['/users-area']);
    }
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

  toggleMobileFilterPanel() {
    this.mobileFilterExpanded.update(value => !value);
  }

  openGeoJsonDownloadDialog() {
    const dialogData: GeoJsonDownloadDialogData = {
      selectedActivities: this.filterConfigService.selectedActivities(),
      selectedPersonas: this.filterConfigService.selectedPersonas(),
      profileCombinationId: this.filterConfigService.currentProfileCombinationID(),
      hasCategories: this.filterConfigService.hasCategories(),
    };

    this.dialog.open(GeoJsonDownloadDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      data: dialogData,
    });
  }
}
