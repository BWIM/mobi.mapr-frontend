import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// PrimeNG Imports
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { PanelModule } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    ButtonModule,
    ProgressSpinnerModule,
    PanelModule,
    TableModule,
    TagModule,
    ProgressBarModule,
    MessageModule,
    TooltipModule
  ],
  exports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    ButtonModule,
    ProgressSpinnerModule,
    PanelModule,
    TableModule,
    TagModule,
    ProgressBarModule,
    MessageModule,
    TooltipModule
  ],
  providers: [MessageService]
})
export class SharedModule { } 