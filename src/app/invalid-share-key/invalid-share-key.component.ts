import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-invalid-share-key',
    standalone: true,
    imports: [CommonModule, TranslateModule],
    templateUrl: './invalid-share-key.component.html',
    styleUrl: './invalid-share-key.component.css'
})
export class InvalidShareKeyComponent {
    constructor(
        private router: Router,
        public translate: TranslateService
    ) {
        // Get saved language preference or default to German
        const savedLang = localStorage.getItem('language') || 'de';
        this.translate.use(savedLang);
    }

    goToLogin(): void {
        this.router.navigate(['/login']);
    }

    goToLanding(): void {
        this.router.navigate(['/landing']);
    }
}
