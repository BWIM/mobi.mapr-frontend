import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { LanguageService } from '../services/language.service';

@Component({
    selector: 'app-invalid-share-key',
    standalone: true,
    imports: [CommonModule, TranslateModule, MatIconModule, MatButtonModule],
    templateUrl: './invalid-share-key.component.html',
    styleUrl: './invalid-share-key.component.css'
})
export class InvalidShareKeyComponent {
    constructor(
        private router: Router,
        private languageService: LanguageService
    ) {
        this.languageService.setLanguage(
            this.languageService.getSavedLanguage() || this.languageService.getCurrentLanguage()
        );
    }

    goToLogin(): void {
        this.router.navigate(['/login']);
    }

    goToLanding(): void {
        this.router.navigate(['/landing']);
    }
}
