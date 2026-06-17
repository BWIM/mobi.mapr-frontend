import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RegioStar } from '../interfaces/regiostar';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams } from './project-access-params';


@Injectable({
  providedIn: 'root'
})
export class RegioStarService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  // RegioStar CRUD Operations
  getRegioStars(page: number = 1, pageSize: number = 10): Observable<PaginatedResponse<RegioStar>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    params = appendProjectAccessParams(params, this.dashboardSessionService);

    return this.http.get<PaginatedResponse<RegioStar>>(`${this.apiUrl}/regiostar/`, { params });
  }

  getRegioStarById(id: number): Observable<RegioStar> {
    return this.http.get<RegioStar>(`${this.apiUrl}/regiostar/${id}/`);
  }
}
