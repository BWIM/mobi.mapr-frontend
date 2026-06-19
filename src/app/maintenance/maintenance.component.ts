import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { interval, Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { HealthService } from '../services/health.service';

@Component({
    selector: 'app-maintenance',
    standalone: true,
    imports: [CommonModule, TranslateModule, MatIconModule, MatProgressSpinnerModule],
    templateUrl: './maintenance.component.html',
    styleUrl: './maintenance.component.css'
})
export class MaintenanceComponent implements OnInit, OnDestroy {
    private healthCheckSubscription?: Subscription;
    private checkInterval = 5000;
    isChecking = false;

    constructor(
        private router: Router,
        private languageService: LanguageService,
        private healthService: HealthService
    ) {
        this.languageService.setLanguage(
            this.languageService.getSavedLanguage() || this.languageService.getCurrentLanguage()
        );
    }

    ngOnInit(): void {
        this.startHealthCheck();
    }

    ngOnDestroy(): void {
        this.stopHealthCheck();
    }

    private startHealthCheck(): void {
        this.isChecking = true;
        this.checkHealth();
        this.healthCheckSubscription = interval(this.checkInterval).subscribe(() => {
            this.checkHealth();
        });
    }

    private stopHealthCheck(): void {
        this.healthCheckSubscription?.unsubscribe();
    }

    private checkHealth(): void {
        this.healthService.checkHealth().subscribe(health => {
            if (this.healthService.isHealthy(health)) {
                this.stopHealthCheck();
                this.router.navigate(['/landing']);
            }
        });
    }
}
