import {Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {catchError} from 'rxjs/operators';
import { ShareProject } from './share.interface';

@Injectable({
  providedIn: 'root'
})
export class ShareService {
  private BASE_URL = `${environment.apiUrl}/share`;

  constructor(private http: HttpClient) {}

  createShare(project: number, resolution: string): Observable<any> {
    return this.http.get<any>(`${this.BASE_URL}?id=${project}&resolution=${resolution}`);
  }

  getProject(key: string): Observable<any> {
    return this.http.get<any>(`${this.BASE_URL}?key=${key}`).pipe(
      catchError(error => {
        console.error('Error fetching project:', error); // Log the error
        // Return an observable with an empty result or a custom error response
        return of(null); // or you could return an error response like `of({ error: true })`
      })
    );
  }

  getProjectDetails(key: string): Observable<ShareProject | null> {
    return this.http.get<any>(`${this.BASE_URL}?key=${key}&info=true`).pipe(
      catchError(error => {
        console.error('Error fetching project:', error); // Log the error
        // Return an observable with an empty result or a custom error response
        return of(null); // or you could return an error response like `of({ error: true })`
      })
    );
  }
}