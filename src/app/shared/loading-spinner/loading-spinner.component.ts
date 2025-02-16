import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule],
  template: `
    <div class="fixed top-5 right-5 z-[9999]" *ngIf="loadingService.loading$ | async">
      <p-progressSpinner 
        [style]="{width: '50px', height: '50px'}"
        strokeWidth="4"
        animationDuration=".5s">
      </p-progressSpinner>
    </div>
  `,
  styles: [`
    :host ::ng-deep .custom-spinner .p-progress-spinner-circle {
      stroke: var(--primary-color);
    }
  `]
})
export class LoadingSpinnerComponent {
  constructor(public loadingService: LoadingService) {}
} 