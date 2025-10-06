import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { RegioStar } from '../projects/project.interface';

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

@Injectable({
    providedIn: 'root'
})
export class RegioStarService {
    private apiUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    getRegioStars(): Observable<RegioStar[]> {
        return this.http.get<PaginatedResponse<RegioStar>>(`${this.apiUrl}/regiostar/`).pipe(
            map(response => response.results)
        );
    }
}
