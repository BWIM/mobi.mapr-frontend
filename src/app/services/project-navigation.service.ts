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

  switchToProject(targetId: number, options?: { closeOverview?: boolean }): Observable<Project> {
    const currentId = this.projectsService.project()?.id;
    if (currentId === targetId) {
      if (options?.closeOverview) {
        this.updateUrl(targetId, true);
      }
      return new Observable((subscriber) => {
        subscriber.next(this.projectsService.project()!);
        subscriber.complete();
      });
    }

    const isShareKey = this.dashboardSessionService.getAccessMethod() === 'share_key';
    const shareKey = this.dashboardSessionService.getShareKey();

    this.projectsService.clearProject();

    if (isShareKey && shareKey) {
      this.dashboardSessionService.setShareProjectId(targetId.toString());
    } else {
      this.dashboardSessionService.setProjectId(targetId.toString());
    }

    const fetch$ = isShareKey && shareKey
      ? this.projectsService.getProjectByShareKey(shareKey, targetId)
      : this.projectsService.getProjectById(targetId);

    return fetch$.pipe(
      tap({
        next: (project) => {
          this.projectsService.setProject(project);
          if (isShareKey && shareKey) {
            this.dashboardSessionService.setShareProjectId(project.id.toString());
          }
          this.updateUrl(project.id, options?.closeOverview ?? false);
        },
        error: () => {
          if (isShareKey) {
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

  private updateUrl(projectId: number, closeOverview: boolean): void {
    const isShareKey = this.dashboardSessionService.getAccessMethod() === 'share_key';
    const shareKey = this.dashboardSessionService.getShareKey();

    const queryParams: Record<string, string | null> = closeOverview
      ? { overview: null }
      : {};

    if (isShareKey && shareKey) {
      queryParams['share_key'] = shareKey;
      queryParams['project_id'] = projectId.toString();
    } else {
      queryParams['project_id'] = projectId.toString();
    }

    this.router.navigate(['/dashboard'], {
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
