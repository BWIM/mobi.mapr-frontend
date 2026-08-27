import { Injectable, inject, computed, signal, effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, tap } from 'rxjs';
import { ProjectsService } from './project.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Project, projectGroupId } from '../interfaces/project';
import { ProjectGroupSibling } from '../interfaces/project-group';

@Injectable({
  providedIn: 'root'
})
export class ProjectNavigationService {
  private projectsService = inject(ProjectsService);
  private dashboardSessionService = inject(DashboardSessionService);
  private router = inject(Router);

  private _groupSiblings = signal<ProjectGroupSibling[]>([]);
  private _groupSiblingsGroupId = signal<number | null>(null);
  private _siblingsError = signal<string | null>(null);
  private groupLoadGeneration = 0;
  private inFlightGroupId: number | null = null;

  readonly hasGroup = computed(() => !!this.projectsService.project()?.group);
  readonly siblingsError = this._siblingsError.asReadonly();

  readonly siblingsLoading = computed(() => {
    if (this.isShareMode()) {
      return false;
    }

    const project = this.projectsService.project();
    const groupId = project ? projectGroupId(project) : null;
    if (groupId == null || this.projectsService.listedProjectsComplete()) {
      return false;
    }

    return this._groupSiblingsGroupId() !== groupId;
  });

  readonly siblingProjects = computed((): ProjectGroupSibling[] => {
    const project = this.projectsService.project();
    if (!project) {
      return [];
    }

    if (this.isShareMode()) {
      return this.sortSiblings(project.group?.projects ?? []);
    }

    const groupId = projectGroupId(project);
    if (groupId == null) {
      return [];
    }

    if (this.projectsService.listedProjectsComplete()) {
      return this.siblingsFromListedProjects(groupId, project);
    }

    if (this._groupSiblingsGroupId() === groupId) {
      return this._groupSiblings();
    }

    return [];
  });

  readonly activeProjectId = computed(() => this.projectsService.project()?.id ?? null);

  constructor() {
    effect(() => {
      const project = this.projectsService.project();
      if (!project || this.isShareMode()) {
        return;
      }

      const groupId = projectGroupId(project);
      if (groupId == null || this.projectsService.listedProjectsComplete()) {
        return;
      }

      if (this._groupSiblingsGroupId() === groupId || this.inFlightGroupId === groupId) {
        return;
      }

      untracked(() => this.loadGroupSiblings(groupId));
    });
  }

  switchToProject(
    targetId: number,
    options?: { closeOverview?: boolean; siblingShareKey?: string | null }
  ): Observable<Project> {
    const currentId = this.projectsService.project()?.id;
    const shareKey = this.dashboardSessionService.getShareKey();
    const isShareMode = this.isShareMode();
    const targetShareKey = options?.siblingShareKey ?? shareKey ?? null;

    if (currentId === targetId && (!isShareMode || !targetShareKey || targetShareKey === shareKey)) {
      if (options?.closeOverview) {
        this.updateUrl(targetId, true, targetShareKey);
      }
      return new Observable((subscriber) => {
        subscriber.next(this.projectsService.project()!);
        subscriber.complete();
      });
    }

    this.projectsService.clearProject();

    if (isShareMode && targetShareKey) {
      this.dashboardSessionService.setShareKey(targetShareKey);
    } else {
      this.dashboardSessionService.setProjectId(targetId.toString());
    }

    const fetch$ = isShareMode && targetShareKey
      ? this.projectsService.getProjectByShareKey(targetShareKey)
      : this.projectsService.getProjectById(targetId);

    return fetch$.pipe(
      tap({
        next: (project) => {
          this.projectsService.setProject(project);
          this.updateUrl(project.id, options?.closeOverview ?? false, targetShareKey);
        },
        error: () => {
          if (isShareMode) {
            this.router.navigate(['/invalid-share-key']);
          } else {
            this.router.navigate(['/users-area']);
          }
        },
      })
    );
  }

  openGroupOverview(): void {
    this.router.navigate(['/dashboard'], {
      queryParams: { overview: 'true' },
      queryParamsHandling: 'merge',
    });
  }

  closeGroupOverview(): void {
    this.router.navigate(['/dashboard'], {
      queryParams: { overview: null },
      queryParamsHandling: 'merge',
    });
  }

  private isShareMode(): boolean {
    return !this.dashboardSessionService.getIsAuthenticated()
      && !!this.dashboardSessionService.getShareKey();
  }

  private siblingsFromListedProjects(groupId: number, current: Project): ProjectGroupSibling[] {
    const siblings = this.projectsService.listedProjects()
      .filter(project => projectGroupId(project) === groupId)
      .map(project => this.toSibling(project));

    if (!siblings.some(sibling => sibling.id === current.id)) {
      siblings.push(this.toSibling(current));
    }

    return this.sortSiblings(siblings);
  }

  private loadGroupSiblings(groupId: number): void {
    const loadGeneration = ++this.groupLoadGeneration;
    this.inFlightGroupId = groupId;
    this._siblingsError.set(null);

    this.projectsService.getProjectGroup(groupId).pipe(
      map(group => group.projects ?? []),
      catchError(() => this.projectsService.getAllProjects(groupId).pipe(
        map(projects => projects.map(project => this.toSibling(project)))
      ))
    ).subscribe({
      next: (siblings) => {
        if (loadGeneration !== this.groupLoadGeneration) {
          return;
        }
        this.inFlightGroupId = null;
        this._groupSiblings.set(this.sortSiblings(siblings));
        this._groupSiblingsGroupId.set(groupId);
      },
      error: () => {
        if (loadGeneration !== this.groupLoadGeneration) {
          return;
        }
        this.inFlightGroupId = null;
        this._groupSiblings.set([]);
        this._groupSiblingsGroupId.set(groupId);
        this._siblingsError.set('groupOverview.loadError');
      },
    });
  }

  private toSibling(project: Pick<Project, 'id' | 'display_name' | 'pin'>): ProjectGroupSibling {
    return {
      id: project.id,
      display_name: project.display_name,
      pin: project.pin,
    };
  }

  private sortSiblings(siblings: ProjectGroupSibling[]): ProjectGroupSibling[] {
    return [...siblings].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  private updateUrl(projectId: number, closeOverview: boolean, shareKeyOverride?: string | null): void {
    const shareKey = shareKeyOverride ?? this.dashboardSessionService.getShareKey();
    const isShareKey = !this.dashboardSessionService.getIsAuthenticated() && !!shareKey;

    const queryParams: Record<string, string | null> = closeOverview
      ? { overview: null }
      : {};

    if (isShareKey && shareKey) {
      queryParams['share_key'] = shareKey;
      queryParams['project_id'] = null;
    } else {
      queryParams['project_id'] = projectId.toString();
      queryParams['share_key'] = null;
    }

    this.router.navigate(['/dashboard'], {
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
