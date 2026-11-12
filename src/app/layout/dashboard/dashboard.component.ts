import { NgClass } from '@angular/common';
import { Component, signal, inject, effect, untracked, computed, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
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
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
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
import { TutorialOverlayComponent } from '../../tutorial/tutorial-overlay.component';
import { TutorialLayout, TutorialService } from '../../tutorial/tutorial.service';
import { openShareDialog } from '../../shared/share-dialog/open-share-dialog';
import { ShareAccessService } from '../../services/share-access.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    NgClass,
    RailComponent,
    LeftComponent,
    RightComponent,
    CenterComponent,
    TranslateModule,
    MatIconModule,
    MobileFilterPanelComponent,
    MobileMapControlsComponent,
    MobileSheetsComponent,
    GroupOverviewComponent,
    TutorialOverlayComponent,
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
  readonly tutorial = inject(TutorialService);
  private destroyRef = inject(DestroyRef);
  private dialog = inject(MatDialog);
  private shareAccess = inject(ShareAccessService);

  /** Matches right panel `duration-300` transition in dashboard template. */
  private static readonly RIGHT_PANEL_TRANSITION_MS = 300;
  /** Grace period after the dashboard is ready before the tour opens, so the map can render first. */
  private static readonly TUTORIAL_START_DELAY_MS = 1000;

  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);
  mobileFilterExpanded = signal(false);
  showGroupOverview = signal(false);
  private hasInitialized = false;
  private tutorialAutoStartChecked = false;
  private currentProjectIdentifier: string | null = null;

  readonly isMobile = this.mobileUi.isMobile;
  /** The right panel holds stats and analyze; a share may disable both. */
  readonly hasRightPanel = computed(() => this.shareAccess.canUseStats() || this.shareAccess.canAnalyze());

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
        if (!this.shareAccess.canAnalyze()) {
          return;
        }
        if (this.mobileUi.isMobile()) {
          this.mobileUi.openAnalyze();
        } else if (this.filterConfigService.isMapCompareMode()) {
          this.rightPanelExpanded.set(true);
          this.resizeMapAfterPanelTransition();
        }
      });

    this.setupTutorial();

    // The map gets wider/narrower when a share hides or shows the whole right panel.
    let hadRightPanel: boolean | null = null;
    effect(() => {
      const hasRightPanel = this.hasRightPanel();
      if (hadRightPanel !== null && hadRightPanel !== hasRightPanel) {
        untracked(() => this.resizeMapAfterPanelTransition());
      }
      hadRightPanel = hasRightPanel;
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
        if (isLoggedIn && shareKey) {
          await this.resolveShareKeyForLoggedInUser(shareKey, projectId);
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
        const isFirstLoad = this.currentProjectIdentifier === null;

        const projectChanged = this.currentProjectIdentifier !== newProjectIdentifier;
        const targetProjectId = isLoggedIn
          ? (projectId || existingProjectId)
          : null;
        const activeShareKey = !isLoggedIn ? (shareKey || existingShareKey) : null;
        // Share viewers: `project_id` next to `share_key` selects a sibling the share grants;
        // without it the share's own project is shown.
        const shareProjectId = !isLoggedIn && activeShareKey ? (projectId ?? null) : null;
        const loaded = this.projectService.project();
        const alreadyLoaded = isLoggedIn
          ? !!loaded &&
            !!targetProjectId &&
            loaded.id === Number(targetProjectId)
          : !!loaded &&
            !!activeShareKey &&
            this.dashboardSessionService.getShareKey() === activeShareKey &&
            loaded.id === (shareProjectId ? Number(shareProjectId) : (loaded.share?.project_id ?? loaded.id));

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

          if ((projectChanged || !this.projectService.isInitialized()) && !alreadyLoaded) {
            const loadedProject = await this.validateShareKeyAndPreload(activeShareKey, shareProjectId);
            if (!loadedProject) {
              return;
            }
            // A fresh share link without any view params opens in the share's default view.
            if (isFirstLoad && shareKey) {
              this.urlState.applyShareDefaultView(loadedProject.share?.default_view, params);
            }
          } else if (alreadyLoaded && loaded) {
            this.dashboardSessionService.setProjectId(loaded.id.toString());
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
    return key ? `share:${key}:${projectId ?? ''}` : null;
  }

  private updateGroupOverviewState(overviewRequested: boolean): void {
    const project = this.projectService.project();
    const hasGroup = this.projectNavigation.hasGroup();
    if (overviewRequested && hasGroup) {
      this.showGroupOverview.set(true);
      return;
    }

    this.showGroupOverview.set(false);
    if (overviewRequested && project && !hasGroup) {
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
   * Finds the project behind a share key (or the sibling given by `project_id`) for a logged-in
   * user and switches the URL to `project_id` only, keeping all other params. Falls back to the
   * users area when the user has no access to that project.
   */
  private async resolveShareKeyForLoggedInUser(shareKey: string, projectId?: string): Promise<void> {
    try {
      const siblingId = Number(projectId);
      const shared = await firstValueFrom(
        Number.isSafeInteger(siblingId) && siblingId > 0
          ? this.projectService.getProjectById(siblingId, shareKey)
          : this.projectService.getProjectByShareKey(shareKey)
      );
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
   * Loads the project for a share key: the share's own project, or `projectId` when the URL
   * names a sibling. The key stays the same either way, since it decides the viewer's rights.
   * A sibling the key does not grant falls back to the share's own project.
   */
  private async validateShareKeyAndPreload(
    shareKey: string,
    projectId: string | null
  ): Promise<Project | null> {
    this.dashboardSessionService.setShareKey(shareKey);
    this.dashboardSessionService.setProjectId(projectId);

    const siblingId = Number(projectId);
    const hasSibling = !!projectId && Number.isSafeInteger(siblingId) && siblingId > 0;

    let project: Project;
    try {
      project = await firstValueFrom(
        hasSibling
          ? this.projectService.getProjectById(siblingId, shareKey)
          : this.projectService.getProjectByShareKey(shareKey)
      );
    } catch (error) {
      if (hasSibling) {
        console.warn('Share key does not grant this project, opening the shared project:', error);
        this.router.navigate(['/dashboard'], {
          queryParams: { [URL_PARAM.projectId]: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      } else {
        console.error('Error fetching project with share key:', error);
        this.router.navigate(['/invalid-share-key']);
      }
      return null;
    }

    if (this.dashboardSessionService.getShareKey() !== shareKey) {
      return null;
    }
    this.dashboardSessionService.setProjectId(project.id.toString());
    this.projectService.setProject(project);
    return project;
  }

  startTutorial(): void {
    this.tutorial.start();
  }

  openShareDialog(): void {
    openShareDialog(this.dialog);
  }

  private setupTutorial(): void {
    // Auto-start once for first-time external (not logged-in) visitors, after the project is shown.
    effect(() => {
      const ready =
        this.projectService.hasProject() &&
        !this.projectService.isLoading() &&
        !this.mapService.isMapLoading() &&
        !this.showGroupOverview();
      if (!ready || this.tutorialAutoStartChecked) {
        return;
      }
      this.tutorialAutoStartChecked = true;
      if (this.authService.isLoggedIn() || !this.tutorial.shouldAutoStart()) {
        return;
      }
      const timeoutId = setTimeout(() => {
        if (!this.tutorial.isActive() && !this.showGroupOverview()) {
          this.tutorial.start();
        }
      }, DashboardComponent.TUTORIAL_START_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timeoutId));
    });

    // Open the panels / sheets the current step points at.
    effect(() => {
      const layout = this.tutorial.currentStep()?.layout;
      if (layout) {
        untracked(() => this.applyTutorialLayout(layout));
      }
    });

    // Leave the mobile filter panel the way users expect it after the tour.
    let wasActive = false;
    effect(() => {
      const active = this.tutorial.isActive();
      if (wasActive && !active && this.mobileFilterExpanded()) {
        untracked(() => this.toggleMobileFilterPanel());
      }
      wasActive = active;
    });
  }

  private applyTutorialLayout(layout: TutorialLayout): void {
    if (layout.closeDialogs && this.dialog.openDialogs.length > 0) {
      this.dialog.closeAll();
    }

    if (this.mobileUi.isMobile()) {
      if (layout.closeMobileSheet && this.mobileUi.isSheetOpen()) {
        this.mobileUi.closeSheet();
      }
      if (layout.mobileAnalyzeMain && this.mobileUi.isAnalyzeOpen() && this.mobileUi.analyzeStep() !== 'main') {
        this.mobileUi.backToAnalyze();
      }
      if (layout.mobileFilter !== undefined && layout.mobileFilter !== this.mobileFilterExpanded()) {
        this.toggleMobileFilterPanel();
      }
      return;
    }

    let resized = false;
    if (layout.leftPanel && !this.leftPanelExpanded()) {
      this.leftPanelExpanded.set(true);
      resized = true;
    }
    if (layout.rightPanel && !this.rightPanelExpanded() && !this.filterConfigService.isMapCompareMode()) {
      this.rightPanelExpanded.set(true);
      resized = true;
    }
    if (resized) {
      this.resizeMapAfterPanelTransition();
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
