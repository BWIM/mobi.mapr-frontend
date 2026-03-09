import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Activity } from '../interfaces/activity';
import { PaginatedResponse } from '../interfaces/http';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getActivities(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Activity>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Activity>>(`${this.apiUrl}/activities/`, { params });
  }
}
