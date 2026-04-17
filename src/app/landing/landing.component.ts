import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';
import { LanguageService } from '../services/language.service';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [CommonModule, TranslateModule],
    templateUrl: './landing.component.html'
})
export class LandingComponent implements OnInit {
    currentLang: string = 'de';
    availableLangs = [
        { code: 'de', name: 'Deutsch' },
        { code: 'en', name: 'English' }
    ];

    constructor(public router: Router, public translate: TranslateService, private authService: AuthService, private languageService: LanguageService) {
        // Initialize language using LanguageService
        this.translate.setDefaultLang('de');
        const savedLang = this.languageService.getSavedLanguage() || 'de';
        this.currentLang = savedLang;
        this.translate.use(savedLang);
    }

    ngOnInit(): void {
        // Check if user is already logged in and redirect to users-area
        if (this.authService.isLoggedIn()) {
            if (this.router.url.includes('redirect=false')) {

            } else {
                // Logged-in users arriving without a specific project/share-key
                // are sent to the users-area to choose a project.
                this.router.navigate(['/users-area']);
            }
        }
    }

    // External links for the public landing page
    externalLinks = {
        projectMainSite: 'https://mobimapr.bw-im.de',
        instituteSite: 'https://bw-im.de',
        bigProjectTryOut: 'https://mapr.mobi/dashboard?share_key=alltagsmobilitaet'
    };

    // Navigate to login page
    goToLogin() {
        this.router.navigate(['/login']);
    }


    // Open external links in new tab
    openExternalLink(url: string) {
        window.open(url, '_blank');
    }

    // Switch language
    switchLanguage(lang: string) {
        this.currentLang = lang;
        this.languageService.setLanguage(lang);
    }
}
