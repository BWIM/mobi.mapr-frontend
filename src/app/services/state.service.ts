import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PaginatedResponse } from '../interfaces/http';
import { State } from '../interfaces/features';



@Injectable({
  providedIn: 'root'
})
export class StateService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) { }

  // State CRUD Operations
  getStates(page: number = 1, pageSize: number = 10): Observable<PaginatedResponse<State>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<State>>(`${this.apiUrl}/states/`, { params });
  }

  getStateById(id: number): Observable<State> {
    return this.http.get<State>(`${this.apiUrl}/states/${id}/`);
  }
}
