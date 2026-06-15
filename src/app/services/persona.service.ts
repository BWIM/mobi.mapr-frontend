
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Persona } from '../interfaces/persona';
import { PaginatedResponse } from '../interfaces/http';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams } from './project-access-params';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  getPersonas(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Persona>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    params = appendProjectAccessParams(params, this.dashboardSessionService);

    return this.http.get<PaginatedResponse<Persona>>(`${this.apiUrl}/personas/`, { params });
  }
}
