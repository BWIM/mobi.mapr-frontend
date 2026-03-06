import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Profile, ProfileCombination } from '../interfaces/profile';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  getProfiles(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Profile>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Profile>>(`${this.apiUrl}/profiles/`, { params });
  }

  getProfileCombinations(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<ProfileCombination>> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    // Add project or key
    if (projectId) {
      params = params.set('project', projectId.toString());
    } else if (shareKey) {
      params = params.set('key', shareKey);
    }

    return this.http.get<PaginatedResponse<ProfileCombination>>(`${this.apiUrl}/profile-combinations/`, { params });
  }
}
