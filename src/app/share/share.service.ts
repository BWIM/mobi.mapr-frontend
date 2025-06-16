import {Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {catchError} from 'rxjs/operators';
import { ShareProject } from './share.interface';

interface ShareResponse {
  id: number;
  key: string;
}

@Injectable({
  providedIn: 'root'
})
export class ShareService {
  private BASE_URL = `${environment.apiUrl}/share`;
  private currentShareKey: string | null = null;

  constructor(private http: HttpClient) {}

  setShareKey(key: string) {
    this.currentShareKey = key;
  }

  getShareKey(): string | null {
    return this.currentShareKey;
  }

  getAuthHeaders(): HttpHeaders {
    const headers = new HttpHeaders();
    if (this.currentShareKey) {
      return headers.set('Authorization', `Bearer ${this.currentShareKey}`);
    }
    return headers;
  }

  createShare(project: number, resolution: string): Observable<ShareResponse> {
    return this.http.get<ShareResponse>(`${this.BASE_URL}?id=${project}&resolution=${resolution}`);
  }

  getProject(key: string): Observable<ShareResponse | null> {
    this.setShareKey(key);
    return this.http.get<ShareResponse>(`${this.BASE_URL}?key=${key}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error fetching project:', error);
        return of(null);
      })
    );
  }

  getProjectDetails(key: string): Observable<ShareProject | null> {
    return this.http.get<ShareProject>(`${this.BASE_URL}?key=${key}&info=true`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error fetching project details:', error);
        return of(null);
      })
    );
  }
}