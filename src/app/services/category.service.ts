
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Category } from '../interfaces/category';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  getCategories(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Category>> {
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    params = appendProjectAccessParams(params, this.dashboardSessionService);

    return this.http.get<PaginatedResponse<Category>>(`${this.apiUrl}/categories/`, { params });
  }
}
