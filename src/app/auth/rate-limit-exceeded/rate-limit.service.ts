import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface RateLimitInfo {
    active_users: number;
    max_users: number;
    utilization_percent: number;
    timeout_seconds: number;
    active_sessions_count: number;
    expired_sessions_count: number;
    status: string;
}

export interface RateLimitCheckResponse {
    can_proceed: boolean;
    rate_limit_info: RateLimitInfo;
}

@Injectable({
    providedIn: 'root'
})
export class RateLimitService {
    private apiUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    getRateLimitInfo(): Observable<RateLimitInfo> {
        return this.http.get<RateLimitInfo>(`${this.apiUrl}/api/concurrent-users`);
    }

    checkRateLimitStatus(): Observable<RateLimitCheckResponse> {
        return this.http.get<RateLimitInfo>(`${this.apiUrl}/api/concurrent-users`).pipe(
            map((info: RateLimitInfo) => ({
                can_proceed: info.status === 'healthy' && info.active_users < info.max_users,
                rate_limit_info: info
            }))
        );
    }
}
