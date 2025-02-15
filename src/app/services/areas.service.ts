import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Area } from './interfaces/area.interface';

@Injectable({
  providedIn: 'root'
})
export class AreasService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getAreas(): Observable<Area[]> {
    return this.http.get<Area[]>(`${this.apiUrl}/areas/`).pipe(
      map(areas => areas.sort((a, b) => 
        (a.display_name || a.name).localeCompare(b.display_name || b.name)
      ))
    );
  }
} 