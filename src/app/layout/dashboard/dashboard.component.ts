import { Component, signal, inject, effect, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { AuthService } from '../../auth/auth.service';
import { ProjectsService } from '../../services/project.service';
import { MapService, ContentLayerFilters } from '../../services/map.service';
import { FilterConfigService } from '../../services/filter-config.service';
import { Project } from '../../interfaces/project';
import { firstValueFrom } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MobileFilterPanelComponent } from '../mobile-filter-panel/mobile-filter-panel.component';
import { GeoJsonDownloadDialogComponent, GeoJsonDownloadDialogData } from '../left/geojson-download-dialog/geojson-download-dialog.component';
import { MobileUiService } from '../../services/mobile-ui.service';
import { FeatureSelectionService } from '../../shared/services/feature-selection.service';
import { MobileMapControlsComponent } from '../mobile/mobile-map-controls/mobile-map-controls.component';
import { MobileSheetsComponent } from '../mobile/mobile-sheets/mobile-sheets.component';
import { GroupOverviewComponent } from '../../group-overview/group-overview.component';
import { ProjectNavigationService } from '../../services/project-navigation.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    RailComponent,
    LeftComponent,
    RightComponent,
    CenterComponent,
    TranslateModule,
    MatIcon,
    MobileFilterPanelComponent,
    MobileMapControlsComponent,
    MobileSheetsComponent,
    GroupOverviewComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);
  private projectService = inject(ProjectsService);
  private mapService = inject(MapService);
  readonly filterConfigService = inject(FilterConfigService);
  private dialog = inject(MatDialog);
  readonly mobileUi = inject(MobileUiService);
  private featureSelectionService = inject(FeatureSelectionService);
  private projectNavigation = inject(ProjectNavigationService);

  /** Matches right panel `duration-300` transition in dashboard template. */
  private static readonly RIGHT_PANEL_TRANSITION_MS = 300;

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);
  mobileFilterExpanded = signal(false);
  showGroupOverview = signal(false);
  private hasInitialized = false;
  private currentProjectIdentifier: string | null = null;

  readonly isMobile = this.mobileUi.isMobile;

  constructor() {
    this.featureSelectionService.selectedMapLibreFeature$
      .pipe(
        takeUntilDestroyed(),
        filter((feature) => feature !== null),
      )
      .subscribe(() => {
        if (this.mobileUi.isMobile()) {
          this.mobileUi.openAnalyze();
        }
      });

    effect(() => {
      if (!this.mobileUi.isMobile() && this.mobileUi.isSheetOpen()) {
        this.mobileUi.closeSheet();
      }
    });

    effect(() => {
      if (this.filterConfigService.isMapCompareMode()) {
        this.rightPanelExpanded.set(false);
      }
    });

    effect((onCleanup) => {
      if (!this.filterConfigService.pendingMapCompareEnable()) {
        return;
      }

      // Re-run when prerequisites (filter data, modes, project) become available.
      if (!this.filterConfigService.canConfirmMapCompare()) {
        return;
      }

      const confirm = () => {
        if (!this.filterConfigService.canConfirmMapCompare()) {
          return;
        }
        this.filterConfigService.confirmEnableMapCompare();
      };

      if (this.mobileUi.isMobile()) {
        const id = requestAnimationFrame(confirm);
        onCleanup(() => cancelAnimationFrame(id));
        return;
      }

      const needsCollapse = untracked(() => this.rightPanelExpanded());
      if (needsCollapse) {
        untracked(() => this.rightPanelExpanded.set(false));
        const timeoutId = setTimeout(confirm, DashboardComponent.RIGHT_PANEL_TRANSITION_MS);
        onCleanup(() => clearTimeout(timeoutId));
      } else {
        const rafId = requestAnimationFrame(confirm);
        onCleanup(() => cancelAnimationFrame(rafId));
      }
    });
    // First check: If user is not logged in and no share_key, redirect to login
    this.route.queryParams
      .pipe(
        takeUntilDestroyed(),
        distinctUntilChanged((prev, curr) =>
          prev['project_id'] === curr['project_id'] &&
          prev['share_key'] === curr['share_key'] &&
          prev['overview'] === curr['overview']
        )
      )
      .subscribe(async params => {
        const projectId = params['project_id'];
        const shareKey = params['share_key'];
        const overview = params['overview'] === 'true' || params['overview'] === true;

        // Check authentication tokens
        const isLoggedIn = this.authService.isLoggedIn();

        // Check if there's already a project or share key in the session service
        const existingProjectId = this.dashboardSessionService.getProjectId();
        const existingShareKey = this.dashboardSessionService.getShareKey();
        // Check current route to prevent redirect loops
        const currentUrl = this.router.url.split('?')[0];

        const newProjectIdentifier = this.buildProjectIdentifier(
          isLoggedIn,
          shareKey,
          projectId,
          existingShareKey,
          existingProjectId
        );

        const projectChanged = this.currentProjectIdentifier !== newProjectIdentifier;
        const targetProjectId = isLoggedIn
          ? (projectId || existingProjectId)
          : null;
        const alreadyLoaded =
          !!this.projectService.project() &&
          !!targetProjectId &&
          this.projectService.project()!.id === Number(targetProjectId) &&
          (!isLoggedIn && shareKey
            ? this.dashboardSessionService.getShareKey() === shareKey
            : true);

        if (projectChanged && this.currentProjectIdentifier !== null && !alreadyLoaded) {
          this.projectService.clearProject();
        }
        if (projectChanged) {
          this.hasInitialized = false;
          this.currentProjectIdentifier = newProjectIdentifier;
        }

        if (isLoggedIn) {
          // Authenticated users always use project-id mode.
          this.dashboardSessionService.setShareKey(null);

          if (projectId) {
            this.dashboardSessionService.setProjectId(projectId);
            if ((projectChanged || !this.projectService.isInitialized()) && !alreadyLoaded) {
              await this.loadProjectById(projectId);
            }
            this.hasInitialized = true;
          } else if (existingProjectId) {
            if ((projectChanged || !this.projectService.isInitialized()) && !alreadyLoaded) {
              await this.loadProjectById(existingProjectId);
            }
            this.hasInitialized = true;
          } else if (!this.hasInitialized) {
            if (currentUrl !== '/users-area') {
              this.router.navigate(['/users-area']);
            }
            return;
          }
        } else {
          // Anonymous users always use share-key mode.
          const activeShareKey = shareKey || existingShareKey;
          if (!activeShareKey) {
            if (!this.hasInitialized && currentUrl !== '/landing') {
              this.router.navigate(['/landing']);
            }
            return;
          }

          this.dashboardSessionService.setProjectId(null);

          if ((projectChanged || !this.projectService.isInitialized()) && !alreadyLoaded) {
            await this.validateShareKeyAndPreload(activeShareKey);
          }
          this.hasInitialized = true;
        }

        this.updateGroupOverviewState(overview);
      });
  }

  private buildProjectIdentifier(
    isLoggedIn: boolean,
    shareKey: string | undefined,
    projectId: string | undefined,
    existingShareKey: string | null,
    existingProjectId: string | null
  ): string | null {
    if (isLoggedIn) {
      return projectId || existingProjectId || null;
    }

    const key = shareKey || existingShareKey;
    return key ? `share:${key}` : null;
  }

  private updateGroupOverviewState(overviewRequested: boolean): void {
    const project = this.projectService.project();
    if (overviewRequested && project?.group) {
      this.showGroupOverview.set(true);
      return;
    }

    this.showGroupOverview.set(false);
    if (overviewRequested && !project?.group) {
      this.projectNavigation.closeGroupOverview();
    }
  }

  closeGroupOverview(): void {
    this.projectNavigation.closeGroupOverview();
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
      this.dashboardSessionService.setShareKey(shareKey);

      let project: Project | null = null;
      try {
        project = await firstValueFrom(
          this.projectService.getProjectByShareKey(shareKey)
        );
      } catch (error) {
        console.error('Error fetching project with share key:', error);
        this.router.navigate(['/invalid-share-key']);
        return;
      }

      if (!project) {
        this.router.navigate(['/invalid-share-key']);
        return;
      }

      this.projectService.setProject(project);

      if (!project.base_profiles?.length) {
        return;
      }

      const defaultFilters: ContentLayerFilters = {
        profile_ids: [...project.base_profiles].sort((a, b) => a - b),
        feature_type: 'index'
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
    if (this.filterConfigService.isMapCompareMode()) {
      return;
    }
    this.rightPanelExpanded.update(value => !value);
  }

  toggleMobileFilterPanel() {
    this.mobileFilterExpanded.update(value => !value);
  }

  openGeoJsonDownloadDialog() {
    const dialogData: GeoJsonDownloadDialogData = {
      selectedActivities: this.filterConfigService.selectedActivities(),
      selectedPersonas: this.filterConfigService.selectedPersonas(),
      profileIds: this.filterConfigService.currentProfileIds(),
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
