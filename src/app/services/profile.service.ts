import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Profile } from '../interfaces/profile';
import { PaginatedResponse } from '../interfaces/http';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getProfiles(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Profile>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Profile>>(`${this.apiUrl}/profiles/`, { params });
  }
}
