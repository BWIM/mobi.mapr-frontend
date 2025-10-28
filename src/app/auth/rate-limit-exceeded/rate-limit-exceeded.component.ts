import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { interval, Subscription } from 'rxjs';
import { RateLimitService } from './rate-limit.service';
import { HealthCheckService } from '../../services/health-check.service';

interface RateLimitInfo {
    active_users?: number;
    max_users?: number;
    utilization_percent: number;
    timeout_seconds: number;
    active_sessions_count: number;
    expired_sessions_count: number;
    status: string;
}

@Component({
    selector: 'app-rate-limit-exceeded',
    templateUrl: './rate-limit-exceeded.component.html',
    styleUrls: ['./rate-limit-exceeded.component.css'],
    imports: [
        CommonModule,
        CardModule,
        ButtonModule,
        SelectModule,
        FormsModule,
        TranslateModule
    ]
})
export class RateLimitExceededComponent implements OnInit {
    rateLimitInfo: RateLimitInfo | null = null;
    countdown: number = 0;
    private countdownSubscription?: Subscription;
    private refreshSubscription?: Subscription;
    currentLang = 'de';
    private readonly LANGUAGE_KEY = 'mobi.mapr.language';

    languages = [
        { code: 'de', name: 'Deutsch' },
        { code: 'de-bw', name: 'Badisch' },
        { code: 'de-sw', name: 'Schwäbisch' },
        { code: 'en', name: 'English' }
    ];

    constructor(
        private router: Router,
        private rateLimitService: RateLimitService,
        private translate: TranslateService,
        private healthCheckService: HealthCheckService
    ) {
        this.loadLanguagePreference();
    }

    ngOnInit(): void {
        this.loadRateLimitInfo();
        this.startPeriodicRefresh();
    }

    ngOnDestroy(): void {
        if (this.countdownSubscription) {
            this.countdownSubscription.unsubscribe();
        }
        if (this.refreshSubscription) {
            this.refreshSubscription.unsubscribe();
        }
        // Note: We don't clear pendingShareKey here as the user might navigate back
        // It will be cleared when they successfully load a share or go to landing
    }

    private loadLanguagePreference(): void {
        const savedLang = localStorage.getItem(this.LANGUAGE_KEY);
        if (savedLang) {
            this.currentLang = savedLang;
            this.translate.use(savedLang);
        } else {
            this.translate.setDefaultLang('de');
            this.translate.use('de');
        }
    }

    private loadRateLimitInfo(): void {
        this.rateLimitService.getRateLimitInfo().subscribe({
            next: (info: RateLimitInfo) => {
                this.rateLimitInfo = info;

                // If status is healthy, allow user to proceed via button
                // But only redirect automatically if we're sure it's safe (not already redirecting)
                if (info.status === 'healthy') {
                    // Clear the health check cache so user can proceed
                    this.healthCheckService.clearCache();
                    // Only stop countdown, don't auto-redirect to prevent loops
                    if (this.countdownSubscription) {
                        this.countdownSubscription.unsubscribe();
                    }
                    this.countdown = 0;
                    // Don't auto-redirect - let user click retry or "Go to Landing"
                } else {
                    // Still at capacity, start countdown
                    this.startCountdown(info.timeout_seconds || 300);
                }
            },
            error: (error: any) => {
                console.error('Failed to load rate limit info:', error);
                // Fallback to default values
                this.rateLimitInfo = {
                    utilization_percent: 100,
                    timeout_seconds: 300,
                    active_sessions_count: 1000,
                    expired_sessions_count: 0,
                    status: 'unhealthy'
                };
                this.startCountdown(300);
            }
        });
    }

    private startCountdown(seconds: number): void {
        // Stop any existing countdown
        if (this.countdownSubscription) {
            this.countdownSubscription.unsubscribe();
        }

        this.countdown = seconds;
        this.countdownSubscription = interval(1000).subscribe(() => {
            this.countdown--;
            if (this.countdown <= 0) {
                this.countdown = 0;
                this.checkIfCanRetry();
            }
        });
    }

    private startPeriodicRefresh(): void {
        // Refresh rate limit info every 30 seconds
        this.refreshSubscription = interval(30000).subscribe(() => {
            this.loadRateLimitInfo();
        });
    }

    private checkIfCanRetry(): void {
        // Simply reload the rate limit info, which will handle the logic
        this.loadRateLimitInfo();
    }

    onRetryNow(): void {
        this.checkIfCanRetry();
    }

    onGoToLanding(): void {
        // Clear the health check cache so fresh checks happen
        this.healthCheckService.clearCache();
        // Clear the pending share key when navigating to landing
        sessionStorage.removeItem('pendingShareKey');
        this.router.navigate(['/landing']);
    }

    onGoBackToShare(): void {
        // Clear the health check cache so fresh checks happen
        this.healthCheckService.clearCache();
        // Try to get the share key from sessionStorage first
        const pendingShareKey = sessionStorage.getItem('pendingShareKey');
        if (pendingShareKey) {
            this.router.navigate(['/share', pendingShareKey]);
            return;
        }

        // Fallback: try to get the share key from the referrer
        const referrer = document.referrer;
        if (referrer && referrer.includes('/share/')) {
            const shareKey = referrer.split('/share/')[1];
            if (shareKey) {
                this.router.navigate(['/share', shareKey]);
                return;
            }
        }

        // Final fallback to landing page
        this.router.navigate(['/landing']);
    }

    onLanguageChange(event: any): void {
        const selectedLang = event.value?.code || 'de';
        this.currentLang = selectedLang;
        this.translate.use(selectedLang);
        localStorage.setItem(this.LANGUAGE_KEY, selectedLang);
    }

    formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    onGoBackToProjectPage(): void {
        // Clear the health check cache
        this.healthCheckService.clearCache();
        // route to https://bw-im.de/mobimapr
        this.router.navigate(['https://bw-im.de/mobimapr']);
    }


}
