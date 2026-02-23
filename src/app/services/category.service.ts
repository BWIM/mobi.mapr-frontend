
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Category } from '../interfaces/category';
import { PaginatedResponse } from '../interfaces/http';


@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getCategories(page: number = 1, pageSize: number = 100, mid: boolean = false): Observable<PaginatedResponse<Category>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString())
      .set('mid', mid ? 'true' : 'false');
    return this.http.get<PaginatedResponse<Category>>(`${this.apiUrl}/categories/`, { params });
  }
}
