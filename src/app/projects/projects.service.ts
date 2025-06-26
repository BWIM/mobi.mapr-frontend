import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { 
  Project, 
  ProjectGroup, 
  PaginatedResponse, 
  ProjectCreateUpdate,
  ProjectGroupCreateUpdate, 
  ProjectInfo,
  ExportProject,
  ProjectsFinishedStatus,
  ProjectDetails
} from './project.interface';
import { MapV2Service } from '../map-v2/map-v2.service';
import { ShareService } from '../share/share.service';



@Injectable({
  providedIn: 'root'
})
export class ProjectsService {
  private apiUrl = environment.apiUrl;
  private currentProjectInfo = new BehaviorSubject<ProjectInfo | null>(null);
  public currentProjectInfo$ = this.currentProjectInfo.asObservable();

  constructor(private http: HttpClient, private map2Service: MapV2Service, private shareService: ShareService) { }

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
    this.currentProjectInfo.next(null);
    this.map2Service.resetMap();
    return this.http.post<Project>(`${this.apiUrl}/projects/`, project);
  }

  updateProject(projectId: number, data: {
    display_name?: string;
    description?: string;
    projectgroup_id?: number | null;
  }): Observable<Project> {
    return this.http.patch<Project>(`${this.apiUrl}/projects/${projectId}/`, data);
  }

  deleteProject(id: number): Observable<void> {
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

  updateProjectGroup(groupId: string, projectGroup: ProjectGroup): Observable<ProjectGroup> {
    return this.http.patch<ProjectGroup>(`${this.apiUrl}/projectgroups/${groupId}/`, projectGroup);
  }

  deleteProjectGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/projectgroups/${id}/`);
  }

  getProjectResults(projectId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/projects/${projectId}/map/`);
  }

  getProjectDetails(project: string, maptype: string, featureId: string): Observable<ProjectDetails> {
    if (this.shareService.getIsShare()) {
      const params = new HttpParams()
        .set('key', this.shareService.getShareKey()!)
        .set('project', project)
        .set('maptype', maptype)
        .set('featureId', featureId);
      return this.http.get<ProjectDetails>(`${this.apiUrl}/share-analyze/`, { params });
    } else {

      const params = new HttpParams()
      .set('project', project)
      .set('maptype', maptype)
      .set('featureId', featureId);
      return this.http.get<ProjectDetails>(`${this.apiUrl}/projects/details/`, { params });
    }
  }

  getProjectInfo(projectId: number): Observable<ProjectInfo> {
    return this.http.get<ProjectInfo>(`${this.apiUrl}/projects/${projectId}/info`);
  }

  updateCurrentProjectInfo(info: ProjectInfo | null): void {
    this.currentProjectInfo.next(info);
  }

  getExportInfo(): Observable<ExportProject> {
    const currentProject = this.currentProjectInfo.getValue();
    if (!currentProject) {
      throw new Error('Kein Projekt ausgewählt');
    }
    return this.http.get<ExportProject>(`${this.apiUrl}/projects/${currentProject.id}/export-info`);
  }

  checkAllFinished(): Observable<ProjectsFinishedStatus> {
    return this.http.get<ProjectsFinishedStatus>(`${this.apiUrl}/projects/check-all-finished/`);
  }
}
