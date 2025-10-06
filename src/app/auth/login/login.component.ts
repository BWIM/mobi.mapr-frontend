import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { finalize } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CardModule,
    MessageModule,
    SelectModule,
    TranslateModule
  ]
})
export class LoginComponent {
  loginForm!: FormGroup;
  error: string = '';
  isLoading: boolean = false;
  currentLang = 'de';
  private readonly LANGUAGE_KEY = 'mobi.mapr.language';

  languages = [
    { code: 'de', name: 'Deutsch' },
    { code: 'de-bw', name: 'Badisch' },
    { code: 'de-sw', name: 'Schwäbisch' },
    { code: 'en', name: 'English' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService
  ) {
    this.initForm();
    this.loadLanguagePreference();
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

  private initForm(): void {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onLanguageChange(event: any): void {
    const selectedLang = event.value?.code || 'de';
    this.currentLang = selectedLang;
    this.translate.use(selectedLang);
    localStorage.setItem(this.LANGUAGE_KEY, selectedLang);
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
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.error = 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingaben.';
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
        return `${fieldName === 'username' ? 'Benutzername' : 'Passwort'} ist erforderlich`;
      }
      if (control.errors['minlength']) {
        return `${fieldName === 'username' ? 'Benutzername' : 'Passwort'} muss mindestens ${fieldName === 'username' ? '3' : '6'
          } Zeichen lang sein`;
      }
    }
    return '';
  }
}
