import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule, MatSelectChange } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule
  ]
})
export class LoginComponent {
  loginForm!: FormGroup;
  error: string = '';
  isLoading: boolean = false;
  currentLang = 'de';
  languages: { code: string; name: string }[] = [];
  hidePassword = true;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService,
    private languageService: LanguageService
  ) {
    this.initForm();
    this.currentLang = this.languageService.getCurrentLanguage();
    this.languages = this.languageService.availableLanguages;
  }

  private initForm(): void {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onLanguageChange(event: MatSelectChange): void {
    const selectedLang = event.value || 'de';
    this.languageService.setLanguage(selectedLang);
    this.currentLang = selectedLang;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  onSubmit(): void {
    if (this.loginForm.valid && !this.isLoading) {
      this.isLoading = true;
      this.error = '';

      const { username, password } = this.loginForm.value;
      this.authService.login(username, password).pipe(
        finalize(() => this.isLoading = false)
      ).subscribe({
        next: () => {
          this.router.navigate(['/users-area']);
        },
        error: (err) => {
          this.translate.get('auth.login.loginFailed').subscribe((text: string) => {
            this.error = text;
          });
          console.error('Login error:', err);
        }
      });
    } else {
      Object.keys(this.loginForm.controls).forEach(key => {
        const control = this.loginForm.get(key);
        if (control) {
          control.markAsTouched();
        }
      });
    }
  }

  getFieldError(fieldName: string): string {
    const control = this.loginForm.get(fieldName);
    if (control?.errors && control.touched) {
      if (control.errors['required']) {
        const key = fieldName === 'username' ? 'auth.login.usernameRequired' : 'auth.login.passwordRequired';
        return this.translate.instant(key);
      }
      if (control.errors['minlength']) {
        const key = fieldName === 'username' ? 'auth.login.usernameMinLength' : 'auth.login.passwordMinLength';
        return this.translate.instant(key);
      }
    }
    return '';
  }
}
