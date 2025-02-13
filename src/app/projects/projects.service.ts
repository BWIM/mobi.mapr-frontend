import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { 
  Project, 
  ProjectGroup, 
  PaginatedResponse, 
  ProjectCreateUpdate,
  ProjectGroupCreateUpdate 
} from './project.interface';

@Injectable({
  providedIn: 'root'
})
export class ProjectsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Project CRUD Operations
  getProjects(page: number = 1, pageSize: number = 10): Observable<PaginatedResponse<Project>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
    
    return this.http.get<PaginatedResponse<Project>>(`${this.apiUrl}/projects/`, { params });
  }

  getProject(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/projects/${id}/`);
  }

  createProject(project: ProjectCreateUpdate): Observable<Project> {
    return this.http.post<Project>(`${this.apiUrl}/projects/`, project);
  }

  updateProject(id: string, project: ProjectCreateUpdate): Observable<Project> {
    return this.http.patch<Project>(`${this.apiUrl}/projects/${id}/`, project);
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/projects/${id}/`);
  }

  // ProjectGroup CRUD Operations
  getProjectGroups(page: number = 1, pageSize: number = 10): Observable<PaginatedResponse<ProjectGroup>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
    
    return this.http.get<PaginatedResponse<ProjectGroup>>(`${this.apiUrl}/projectgroups/`, { params });
  }

  getProjectGroup(id: string): Observable<ProjectGroup> {
    return this.http.get<ProjectGroup>(`${this.apiUrl}/projectgroups/${id}/`);
  }

  createProjectGroup(projectGroup: ProjectGroupCreateUpdate): Observable<ProjectGroup> {
    return this.http.post<ProjectGroup>(`${this.apiUrl}/projectgroups/`, projectGroup);
  }

  updateProjectGroup(id: string, projectGroup: ProjectGroupCreateUpdate): Observable<ProjectGroup> {
    return this.http.patch<ProjectGroup>(`${this.apiUrl}/projectgroups/${id}/`, projectGroup);
  }

  deleteProjectGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/projectgroups/${id}/`);
  }
}
