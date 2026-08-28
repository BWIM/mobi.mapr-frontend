import { inject, Injectable, signal, computed, effect } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Project
} from '../interfaces/project';
import { ProjectGroup } from '../interfaces/project-group';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';



@Injectable({
  providedIn: 'root'
})
export class ProjectsService {
  private apiUrl = environment.apiUrl;
  private dashboardSessionService = inject(DashboardSessionService);
  private http = inject(HttpClient);
  private _project = signal<Project | null>(null);
  private _isLoading = signal<boolean>(false);
  private _isInitialized = signal<boolean>(false);
  private _listedProjects = signal<Project[]>([]);
  private _listedProjectsComplete = signal(false);
  /** Bumps on each initialize/set/clear so stale HTTP callbacks cannot overwrite newer state. */
  private projectLoadGeneration = 0;

  // Expose readonly signals for reactive access
  readonly project = this._project.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();
  readonly listedProjects = this._listedProjects.asReadonly();
  readonly listedProjectsComplete = this._listedProjectsComplete.asReadonly();

  // Computed signal to check if project is available
  readonly hasProject = computed(() => this._project() !== null);

  constructor() {
    effect(() => {
      if (!this.dashboardSessionService.isAuthenticated()) {
        this._listedProjects.set([]);
        this._listedProjectsComplete.set(false);
      }
    });
  }

  // Project CRUD Operations
  getProjects(page: number = 1, pageSize: number = 10, groupId?: number): Observable<PaginatedResponse<Project>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (groupId !== undefined) {
      params = params.set('group', groupId.toString());
    }

    return this.http.get<PaginatedResponse<Project>>(`${this.apiUrl}/projects/`, { params });
  }

  getAllProjects(groupId?: number, pageSize: number = 200): Observable<Project[]> {
    const loadPage = (page: number, accumulated: Project[]): Observable<Project[]> =>
      this.getProjects(page, pageSize, groupId).pipe(
        switchMap(response => {
          const combined = [...accumulated, ...response.results];
          if (response.next) {
            return loadPage(page + 1, combined);
          }
          return of(combined);
        })
      );

    return loadPage(1, []);
  }

  getProjectGroup(id: number): Observable<ProjectGroup> {
    return this.http.get<ProjectGroup>(`${this.apiUrl}/project-groups/${id}/`);
  }

  setListedProjects(projects: Project[], complete = true): void {
    this._listedProjects.set(projects);
    this._listedProjectsComplete.set(complete);
  }

  getProjectById(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/projects/${id}/`);
  }

  getProjectByShareKey(shareKey: string): Observable<Project> {
    const params = new HttpParams().set('key', shareKey);
    return this.http.get<Project>(`${this.apiUrl}/projects/share-key/`, { params });
  }

  fetchProject(): Observable<Project> {
    if (this.dashboardSessionService.getShareKey()) {
      const shareKey = this.dashboardSessionService.getShareKey()!;
      return this.getProjectByShareKey(shareKey);
    } else {
      return this.getProjectById(Number(this.dashboardSessionService.getProjectId()));
    }
  }

  setProject(project: Project): void {
    this.projectLoadGeneration++;
    this._project.set(project);
    this._isInitialized.set(true);
    this._isLoading.set(false);
  }

  /**
   * Clear the current project and reset initialization state
   */
  clearProject(): void {
    this.projectLoadGeneration++;
    this._project.set(null);
    this._isInitialized.set(false);
    this._isLoading.set(false);
  }
  
  initializeProject(): void {
    // Prevent multiple simultaneous initializations; Dashboard owns load when already set.
    if (this._isLoading() || this._isInitialized()) {
      return;
    }

    const loadGeneration = ++this.projectLoadGeneration;
    this._isLoading.set(true);
    this.fetchProject().subscribe({
      next: (project) => {
        if (loadGeneration !== this.projectLoadGeneration) {
          return;
        }
        this._project.set(project);
        this._isInitialized.set(true);
        this._isLoading.set(false);
      },
      error: (error) => {
        if (loadGeneration !== this.projectLoadGeneration) {
          return;
        }
        console.error('Error loading project:', error);
        this.clearProject();
      }
    });
  }

  // Legacy method for backwards compatibility (returns current value synchronously)
  getProject(): Project | null {
    return this._project();
  }
}
