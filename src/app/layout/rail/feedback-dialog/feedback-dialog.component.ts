import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FeedbackService } from '../../../services/feedback.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-feedback-dialog',
  standalone: true,
  imports: [
    SharedModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
  templateUrl: './feedback-dialog.component.html',
  styleUrl: './feedback-dialog.component.css'
})
export class FeedbackDialogComponent {
  feedbackForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  private fb = inject(FormBuilder);
  private feedbackService = inject(FeedbackService);
  private translate = inject(TranslateService);

  constructor(
    public dialogRef: MatDialogRef<FeedbackDialogComponent>
  ) {
    this.initForm();
  }

  private initForm(): void {
    this.feedbackForm = this.fb.group({
      problem: ['', [Validators.required]],
      email: ['', [Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.feedbackForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formValue = this.feedbackForm.value;
    const payload = {
      problem: formValue.problem,
      email: formValue.email || undefined
    };

    this.feedbackService.submitFeedback(payload)
      .pipe(
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: () => {
          this.successMessage = this.translate.instant('rail.feedback.success');
          setTimeout(() => {
            this.dialogRef.close();
          }, 2000);
        },
        error: (error) => {
          console.error('Feedback submission error:', error);
          this.errorMessage = this.translate.instant('rail.feedback.error');
        }
      });
  }

  private markFormGroupTouched(): void {
    Object.keys(this.feedbackForm.controls).forEach(key => {
      const control = this.feedbackForm.get(key);
      control?.markAsTouched();
    });
  }

  getFieldError(fieldName: string): string {
    const control = this.feedbackForm.get(fieldName);
    if (control && control.invalid && control.touched) {
      if (control.errors?.['required']) {
        return this.translate.instant('rail.feedback.problemRequired');
      }
      if (control.errors?.['email']) {
        return this.translate.instant('rail.feedback.emailInvalid');
      }
    }
    return '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.feedbackForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
