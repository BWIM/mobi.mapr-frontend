import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [CommonModule, TranslateModule],
    templateUrl: './landing.component.html',
    styleUrl: './landing.component.css'
})
export class LandingComponent implements OnInit {
    currentLang: string = 'de';
    availableLangs = [
        { code: 'de', name: 'Deutsch' },
        { code: 'en', name: 'English' }
    ];

    constructor(public router: Router, public translate: TranslateService, private authService: AuthService) {
        // Get saved language preference or default to German
        const savedLang = localStorage.getItem('language') || 'de';
        this.currentLang = savedLang;
        this.translate.use(savedLang);
    }

    ngOnInit(): void {
        // Check if user is already logged in and redirect to dashboard
        if (this.authService.isLoggedIn()) {
            if (this.router.url.includes('redirect=false')) {

            } else {
                this.router.navigate(['/dashboard']);
            }
        }
    }

    // External links - you can update these URLs as needed
    externalLinks = {
        projectMainSite: 'https://bw-im.de/mobimapr', // Replace with actual project main site URL
        technicalDocs: 'https://bw-im.de/mobimapr-dokumentation', // Replace with actual technical documentation URL
        contact: 'https://bw-im.de/mobimapr-kontakt', // Replace with actual contact URL
        faq: 'https://bw-im.de/mobimapr-faq' // Replace with actual FAQ URL
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
        this.translate.use(lang);
        localStorage.setItem('language', lang);
    }
}
