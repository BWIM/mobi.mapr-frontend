import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Persona } from './interfaces/persona.interface';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Injectable({
  providedIn: 'root'
})
export class PersonasService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getPersonas(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Persona>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Persona>>(`${this.apiUrl}/personas/`, { params });
  }

  getGroupedPersonas(): Observable<Persona[]> {
    return this.getPersonas().pipe(
      map(response => {
        return response.results.sort((a, b) => a.name.localeCompare(b.name));
      })
    );
  }
} 