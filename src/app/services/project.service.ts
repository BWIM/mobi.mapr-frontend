import { inject, Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Project
} from '../interfaces/project';
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
  /** Bumps on each initialize/set/clear so stale HTTP callbacks cannot overwrite newer state. */
  private projectLoadGeneration = 0;

  // Expose readonly signals for reactive access
  readonly project = this._project.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();

  // Computed signal to check if project is available
  readonly hasProject = computed(() => this._project() !== null);

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
