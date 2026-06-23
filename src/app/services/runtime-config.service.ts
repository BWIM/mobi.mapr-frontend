import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface RuntimeConfig {
    maintenanceMode: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class RuntimeConfigService {
    private http = inject(HttpClient);
    maintenanceMode = false;

    load(): Observable<void> {
        return this.http.get<RuntimeConfig>('/assets/config.json').pipe(
            tap(config => {
                this.maintenanceMode = config.maintenanceMode ?? false;
            }),
            catchError(() => {
                this.maintenanceMode = false;
                return of(undefined);
            }),
            map(() => void 0)
        );
    }
}
