import { Injectable, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, tap } from 'rxjs';
import { ProjectsService } from './project.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Project } from '../interfaces/project';
import { ProjectGroup, ProjectGroupMember } from '../interfaces/project-group';
import { PROJECT_SCOPED_PARAMS, URL_PARAM } from '../url-state/url-params';

/** One group of the current project with its members, in the group's order. */
export interface ProjectGroupSection {
  id: number;
  display_name: string;
  projects: ProjectGroupMember[];
}

@Injectable({
  providedIn: 'root'
})
export class ProjectNavigationService {
  private projectsService = inject(ProjectsService);
  private dashboardSessionService = inject(DashboardSessionService);
  private router = inject(Router);

  /**
   * Groups of the current project. A project may be in several groups, so a sibling can show up
   * in more than one section. Members come ordered from the project detail / share-key response.
   */
  readonly groupSections = computed((): ProjectGroupSection[] => {
    const project = this.projectsService.project();
    if (!project) {
      return [];
    }

    const reachable = this.reachableProjectIds(project);
    return (project.groups ?? [])
      .map(group => ({
        id: group.id,
        display_name: group.display_name,
        projects: this.groupMembers(group, project, reachable),
      }))
      .filter(section => section.projects.length > 0);
  });

  readonly hasGroup = computed(() => this.groupSections().length > 0);

  readonly activeProjectId = computed(() => this.projectsService.project()?.id ?? null);

  /**
   * Opens another project. Share viewers keep their own share key and only change the project
   * (`?share_key=<key>&project_id=<id>`), so the share's rights stay in force.
   */
  switchToProject(targetId: number, options?: { closeOverview?: boolean }): Observable<Project> {
    const current = this.projectsService.project();
    if (current?.id === targetId) {
      if (options?.closeOverview) {
        this.updateUrl(targetId, true);
      }
      return of(current);
    }

    const shareKey = this.isShareMode() ? this.dashboardSessionService.getShareKey() : null;

    this.projectsService.clearProject();
    this.dashboardSessionService.setProjectId(targetId.toString());

    return this.projectsService.getProjectById(targetId, shareKey).pipe(
      tap({
        next: (project) => {
          this.projectsService.setProject(project);
          this.updateUrl(project.id, options?.closeOverview ?? false, true);
        },
        error: () => {
          if (shareKey) {
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

  /**
   * Projects the viewer can open, or null when unknown (then every member is shown).
   * Share viewers: the share's `project_ids`. Logged-in users: their project list, once loaded.
   */
  private reachableProjectIds(project: Project): ReadonlySet<number> | null {
    if (this.isShareMode()) {
      const ids = project.share?.project_ids;
      return ids ? new Set([...ids, project.id]) : null;
    }
    if (this.projectsService.listedProjectsComplete()) {
      return new Set([...this.projectsService.listedProjects().map(p => p.id), project.id]);
    }
    return null;
  }

  private groupMembers(
    group: ProjectGroup,
    current: Project,
    reachable: ReadonlySet<number> | null
  ): ProjectGroupMember[] {
    const members = (group.projects ?? [])
      .filter(member => !reachable || reachable.has(member.id))
      .map(({ id, display_name, pin }) => ({ id, display_name, pin }));

    if (!members.some(member => member.id === current.id)) {
      members.push({ id: current.id, display_name: current.display_name, pin: current.pin });
    }
    return members;
  }

  private updateUrl(projectId: number, closeOverview: boolean, projectChanged = false): void {
    const queryParams: Record<string, string | null> = closeOverview
      ? { [URL_PARAM.overview]: null }
      : {};

    if (projectChanged) {
      // Filters, features etc. belong to the previous project; viewport, language,
      // rating mode and stats level carry over.
      for (const param of PROJECT_SCOPED_PARAMS) {
        queryParams[param] = null;
      }
    }

    const shareKey = this.isShareMode() ? this.dashboardSessionService.getShareKey() : null;
    queryParams[URL_PARAM.projectId] = projectId.toString();
    queryParams[URL_PARAM.shareKey] = shareKey;

    this.router.navigate(['/dashboard'], {
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
