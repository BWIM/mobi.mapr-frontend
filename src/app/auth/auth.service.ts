import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, map } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface User {
  username: string;
  token?: string;
}

interface AuthResponse {
  access: string;
  refresh: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private refreshTokenTimeout?: any;

  constructor(private http: HttpClient) {
    // Beim Start prüfen, ob ein Token im localStorage existiert
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      this.currentUserSubject.next(user);
      this.startRefreshTokenTimer();
    }
  }

  login(username: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/token/`, { username, password })
      .pipe(
        map(response => {
          const user: User = {
            username: username,
            token: response.access
          };
          localStorage.setItem('currentUser', JSON.stringify(user));
          localStorage.setItem('refreshToken', response.refresh);
          this.currentUserSubject.next(user);
          this.startRefreshTokenTimer();
          return user;
        }),
        catchError(error => {
          console.error('Login error:', error);
          return throwError(() => new Error('Anmeldung fehlgeschlagen'));
        })
      );
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');
    this.currentUserSubject.next(null);
    this.stopRefreshTokenTimer();
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post<AuthResponse>(`${this.apiUrl}/token/refresh/`, { refresh: refreshToken })
      .pipe(
        tap(response => {
          const user = this.currentUserSubject.value;
          if (user) {
            user.token = response.access;
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.currentUserSubject.next(user);
          }
          this.startRefreshTokenTimer();
        })
      );
  }

  private startRefreshTokenTimer(): void {
    // Zuerst den alten Timer stoppen, falls einer existiert
    this.stopRefreshTokenTimer();

    // Token alle 4 Minuten erneuern (bei 5 Minuten Gültigkeit)
    this.refreshTokenTimeout = setInterval(() => {
      this.refreshToken().subscribe();
    }, 4 * 60 * 1000);
  }

  private stopRefreshTokenTimer(): void {
    if (this.refreshTokenTimeout) {
      clearInterval(this.refreshTokenTimeout);
    }
  }

  getAuthorizationHeaders(): HttpHeaders {
    const currentUser = this.currentUserSubject.value;
    if (currentUser && currentUser.token) {
      return new HttpHeaders({
        'Authorization': `Bearer ${currentUser.token}`
      });
    }
    return new HttpHeaders();
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }
}
