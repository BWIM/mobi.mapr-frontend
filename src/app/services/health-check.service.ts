import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

    constructor(private http: HttpClient) { }

    checkHealth(): Observable<HealthCheckResponse> {
        return this.http.get<HealthCheckResponse>(`${this.apiUrl}/health`);
    }

    isHealthy(): Observable<boolean> {
        return this.http.get(`${this.apiUrl}/health`, { observe: 'response' }).pipe(
            map(response => response.status === 200)
        );
    }
}
