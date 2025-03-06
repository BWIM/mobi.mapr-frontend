import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AreasService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getAreas() {
    return this.http.get(`${this.apiUrl}/landkreise/simple/`);
  }
} 