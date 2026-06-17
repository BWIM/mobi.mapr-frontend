import { Injectable, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ProjectsService } from './project.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Project } from '../interfaces/project';
import { ProjectGroupSibling } from '../interfaces/project-group';

@Injectable({
  providedIn: 'root'
})
export class ProjectNavigationService {
  private projectsService = inject(ProjectsService);
  private dashboardSessionService = inject(DashboardSessionService);
  private router = inject(Router);

  readonly hasGroup = computed(() => !!this.projectsService.project()?.group);

  readonly siblingProjects = computed((): ProjectGroupSibling[] => {
    return this.projectsService.project()?.group?.projects ?? [];
  });

  readonly activeProjectId = computed(() => this.projectsService.project()?.id ?? null);

  switchToProject(
    targetId: number,
    options?: { closeOverview?: boolean; siblingShareKey?: string | null }
  ): Observable<Project> {
    const currentId = this.projectsService.project()?.id;
    const shareKey = this.dashboardSessionService.getShareKey();
    const isShareMode = !this.dashboardSessionService.getIsAuthenticated() && !!shareKey;
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
