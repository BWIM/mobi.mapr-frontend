import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { interval, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
    selector: 'app-maintenance',
    standalone: true,
    imports: [CommonModule, TranslateModule],
    templateUrl: './maintenance.component.html',
    styleUrl: './maintenance.component.css'
})
export class MaintenanceComponent implements OnInit, OnDestroy {
    private healthCheckSubscription?: Subscription;
    private checkInterval = 5000; // Check every 5 seconds
    isChecking = false;

    constructor(
        private router: Router,
        public translate: TranslateService,
        private http: HttpClient
    ) {
        // Get saved language preference or default to German
        const savedLang = localStorage.getItem('language') || 'de';
        this.translate.use(savedLang);
    }

    ngOnInit(): void {
        this.startHealthCheck();
    }

    ngOnDestroy(): void {
        this.stopHealthCheck();
    }

    private startHealthCheck(): void {
        this.isChecking = true;

        // Check immediately
        this.checkHealth();

        // Then check periodically
        this.healthCheckSubscription = interval(this.checkInterval).subscribe(() => {
            this.checkHealth();
        });
    }

    private stopHealthCheck(): void {
        if (this.healthCheckSubscription) {
            this.healthCheckSubscription.unsubscribe();
        }
    }

    private checkHealth(): void {
        this.http.get(`${environment.apiUrl}/health/`, { observe: 'response' })
            .pipe(
                map(response => response.status === 200),
                catchError(() => of(false))
            )
            .subscribe((isHealthy: boolean) => {
                if (isHealthy) {
                    this.stopHealthCheck();
                    // Navigate back to the previous page or dashboard
                    const previousUrl = sessionStorage.getItem('previousUrl') || '/dashboard';
                    this.router.navigate([previousUrl]);
                }
            });
    }
}

