
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Persona } from '../interfaces/persona';
import { PaginatedResponse } from '../interfaces/http';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getPersonas(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Persona>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Persona>>(`${this.apiUrl}/personas/`, { params });
  }
}
