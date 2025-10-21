import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, BehaviorSubject, of } from 'rxjs';
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
  private allPersonas: Persona[] = [];
  private personasLoaded = false;
  private personasSubject = new BehaviorSubject<Persona[]>([]);

  constructor(private http: HttpClient) { }

  getPersonas(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Persona>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Persona>>(`${this.apiUrl}/personas/`, { params });
  }

  private loadAllPersonas(): Observable<Persona[]> {
    if (this.personasLoaded) {
      return of(this.allPersonas);
    }

    return this.getPersonas().pipe(
      map(response => {
        this.allPersonas = response.results.sort((a, b) =>
          (a.display_name || a.name).localeCompare(b.display_name || b.name)
        );
        this.personasLoaded = true;
        this.personasSubject.next(this.allPersonas);
        return this.allPersonas;
      })
    );
  }


  getAllPersonas(): Observable<Persona[]> {
    return this.loadAllPersonas();
  }

  getCachedPersonas(): Persona[] {
    return this.allPersonas;
  }
} 