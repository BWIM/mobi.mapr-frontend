
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Category } from '../interfaces/category';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  getCategories(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Category>> {
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

    return this.http.get<PaginatedResponse<Category>>(`${this.apiUrl}/categories/`, { params });
  }
}
