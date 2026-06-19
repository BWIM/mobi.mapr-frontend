import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class HealthService {
    constructor(private http: HttpClient) { }

    checkHealth(): Observable<{ status: string }> {
        return this.http.get<{ status: string }>(`${environment.baseUrl}/health`).pipe(
            catchError(() => of({ status: 'unhealthy' }))
        );
    }

    isHealthy(health: { status: string }): boolean {
        return health.status === 'healthy';
    }
}

