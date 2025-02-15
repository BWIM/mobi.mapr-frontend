import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Land } from './interfaces/land.interface';

@Injectable({
  providedIn: 'root'
})
export class LandsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLands() {
    return this.http.get<Land[]>(`${this.apiUrl}/laender/simple/`);
  }
} 