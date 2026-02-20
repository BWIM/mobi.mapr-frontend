import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RegioStar } from '../interfaces/regiostar';
import { PaginatedResponse } from '../interfaces/http';


@Injectable({
  providedIn: 'root'
})
export class RegioStarService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) { }

  // RegioStar CRUD Operations
  getRegioStars(page: number = 1, pageSize: number = 10): Observable<PaginatedResponse<RegioStar>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<RegioStar>>(`${this.apiUrl}/regiostar/`, { params });
  }

  getRegioStarById(id: number): Observable<RegioStar> {
    return this.http.get<RegioStar>(`${this.apiUrl}/regiostar/${id}/`);
  }
}
