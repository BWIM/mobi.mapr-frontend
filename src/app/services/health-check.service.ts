import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface HealthCheckResponse {
    status: string;
    timestamp: string;
    uptime: number;
    version?: string;
}

@Injectable({
    providedIn: 'root'
})
export class HealthCheckService {
    private apiUrl = environment.apiUrl;
    private lastHealthCheck: number = 0;
    private healthCheckCooldown: number = 30000; // 30 seconds in milliseconds
    private cachedHealthStatus: boolean | null = null;
    private healthCheckInProgress: boolean = false;
    private healthStatusSubject = new BehaviorSubject<boolean | null>(null);

    constructor(private http: HttpClient) { }

    checkHealth(): Observable<HealthCheckResponse> {
        return this.http.get<HealthCheckResponse>(`${this.apiUrl}/health`);
    }

    isHealthy(): Observable<boolean> {
        const now = Date.now();

        // If we have a cached result and it's within the cooldown period, return it
        if (this.cachedHealthStatus !== null && (now - this.lastHealthCheck) < this.healthCheckCooldown) {
            return of(this.cachedHealthStatus);
        }

        // If a health check is already in progress, return the cached status or wait for the current one
        if (this.healthCheckInProgress) {
            return this.healthStatusSubject.asObservable().pipe(
                map(status => status !== null ? status : false)
            );
        }

        // Perform a new health check
        this.healthCheckInProgress = true;
        this.lastHealthCheck = now;

        return this.http.get(`${this.apiUrl}/health`, { observe: 'response' }).pipe(
            map(response => response.status === 200),
            tap(isHealthy => {
                this.cachedHealthStatus = isHealthy;
                this.healthStatusSubject.next(isHealthy);
                this.healthCheckInProgress = false;
            }),
            switchMap(isHealthy => {
                // If health check fails, reset the cache after a shorter period to allow retries
                if (!isHealthy) {
                    setTimeout(() => {
                        this.cachedHealthStatus = null;
                        this.healthStatusSubject.next(null);
                    }, 5000); // Reset cache after 5 seconds on failure
                }
                return of(isHealthy);
            })
        );
    }
}
