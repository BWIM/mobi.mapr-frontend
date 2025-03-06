import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Mode } from './interfaces/mode.interface';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Injectable({
  providedIn: 'root'
})
export class ModesService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getModes(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Mode>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Mode>>(`${this.apiUrl}/modes/`, { params });
  }

  getGroupedModes(): Observable<Mode[]> {
    return this.getModes().pipe(
      map(response => {
        return response.results.sort((a, b) => a.name.localeCompare(b.name));
      })
    );
  }
} 