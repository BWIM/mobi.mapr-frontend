import { NgClass } from '@angular/common';
import { Component, signal, inject, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { AuthService } from '../../auth/auth.service';
import { ProjectsService } from '../../services/project.service';
import { MapService } from '../../services/map.service';
import { FilterConfigService } from '../../services/filter-config.service';
import { Project } from '../../interfaces/project';
import { firstValueFrom } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';
import { MobileFilterPanelComponent } from '../mobile-filter-panel/mobile-filter-panel.component';
import { MobileUiService } from '../../services/mobile-ui.service';
import { FeatureSelectionService } from '../../shared/services/feature-selection.service';
import { MobileMapControlsComponent } from '../mobile/mobile-map-controls/mobile-map-controls.component';
import { MobileSheetsComponent } from '../mobile/mobile-sheets/mobile-sheets.component';
import { GroupOverviewComponent } from '../../group-overview/group-overview.component';
import { ProjectNavigationService } from '../../services/project-navigation.service';
import { LanguageService } from '../../services/language.service';
import { ReturnUrlService } from '../../auth/return-url.service';
import { URL_PARAM } from '../../url-state/url-params';
import { UrlStateService } from '../../url-state/url-state.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    NgClass,
    RailComponent,
    LeftComponent,
    RightComponent,
    CenterComponent,
    TranslateModule,
    MobileFilterPanelComponent,
    MobileMapControlsComponent,
    MobileSheetsComponent,
    GroupOverviewComponent,
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
  readonly mobileUi = inject(MobileUiService);
  private featureSelectionService = inject(FeatureSelectionService);
  private projectNavigation = inject(ProjectNavigationService);
  private languageService = inject(LanguageService);
  private returnUrlService = inject(ReturnUrlService);
  /** Created here (not at app start) so it reads the dashboard URL before child maps are built. */
  private urlState = inject(UrlStateService);

  /** Matches right panel `duration-300` transition in dashboard template. */
  private static readonly RIGHT_PANEL_TRANSITION_MS = 300;

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);
  mobileFilterExpanded = signal(false);
  showGroupOverview = signal(false);
  private hasInitialized = false;
  private currentProjectIdentifier: string | null = null;

  readonly isMobile = this.mobileUi.isMobile;

  currentLang = signal<string>(this.languageService.getCurrentLanguage());
  readonly availableLangs = this.languageService.availableLanguages;

  constructor() {
    this.languageService.onLanguageChange()
      .pipe(takeUntilDestroyed())
      .subscribe(event => this.currentLang.set(event.lang));

    this.featureSelectionService.selectedMapLibreFeature$
      .pipe(
        takeUntilDestroyed(),
        filter((feature) => feature !== null),
      )
      .subscribe(() => {
        if (this.mobileUi.isMobile()) {
          this.mobileUi.openAnalyze();
        } else if (this.filterConfigService.isMapCompareMode()) {
          this.rightPanelExpanded.set(true);
          this.resizeMapAfterPanelTransition();
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

        // Logged-in users always work in project-id mode: translate a share-key link into the
        // matching project (keeping all other view params) instead of ignoring it.
        if (isLoggedIn && shareKey && !projectId) {
          await this.resolveShareKeyForLoggedInUser(shareKey);
          return;
        }

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
        const activeShareKey = !isLoggedIn ? (shareKey || existingShareKey) : null;
        const alreadyLoaded = isLoggedIn
          ? !!this.projectService.project() &&
            !!targetProjectId &&
            this.projectService.project()!.id === Number(targetProjectId)
          : !!this.projectService.project() &&
            !!activeShareKey &&
            this.dashboardSessionService.getShareKey() === activeShareKey;

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
          if (projectId && !shareKey) {
            // A project link needs a login: remember the full URL and come back after login.
            const target = this.router.serializeUrl(
              this.router.createUrlTree(['/dashboard'], { queryParams: params })
            );
            void this.returnUrlService.redirectToLogin(target);
            return;
          }
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

  switchLanguage(lang: string): void {
    this.languageService.setLanguage(lang);
    this.currentLang.set(lang);
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
   * Finds the project behind a share key for a logged-in user and switches the URL to
   * `project_id`, keeping all other params. Falls back to the users area when the user
   * has no access to that project.
   */
  private async resolveShareKeyForLoggedInUser(shareKey: string): Promise<void> {
    try {
      const shared = await firstValueFrom(this.projectService.getProjectByShareKey(shareKey));
      // Make sure the user can open the project by id (share keys may grant wider access).
      const project = await firstValueFrom(this.projectService.getProjectById(shared.id));
      await this.router.navigate(['/dashboard'], {
        queryParams: { [URL_PARAM.projectId]: project.id, [URL_PARAM.shareKey]: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } catch (error) {
      console.warn('Could not resolve share key to an accessible project:', error);
      this.router.navigate(['/users-area']);
    }
  }

  /**
   * Validates share key by fetching the project
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
    } catch (error) {
      console.error('Unexpected error validating share key:', error);
      this.router.navigate(['/invalid-share-key']);
    }
  }

  toggleLeftPanel() {
    this.leftPanelExpanded.update(value => !value);
    this.resizeMapAfterPanelTransition();
  }

  toggleRightPanel() {
    this.rightPanelExpanded.update(value => !value);
    this.resizeMapAfterPanelTransition();
  }

  private resizeMapAfterPanelTransition() {
    setTimeout(() => {
      this.mapService.getMap()?.resize();
      this.mapService.getCompareRightMap()?.resize();
    }, DashboardComponent.RIGHT_PANEL_TRANSITION_MS);
  }

  toggleMobileFilterPanel() {
    this.mobileFilterExpanded.update(value => !value);
    requestAnimationFrame(() => {
      this.mapService.getMap()?.resize();
      this.mapService.getCompareRightMap()?.resize();
    });
  }
}
