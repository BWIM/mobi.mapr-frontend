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
import { DrawerModule } from 'primeng/drawer';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DialogModule } from 'primeng/dialog';
import { SpeedDialModule } from 'primeng/speeddial';
import { SplitButtonModule } from 'primeng/splitbutton';
import { StepsModule } from 'primeng/steps';

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
    TooltipModule,
    DrawerModule,
    ScrollPanelModule,
    DialogModule,
    SpeedDialModule,
    SplitButtonModule,
    StepsModule
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
    TooltipModule,
    DrawerModule,
    ScrollPanelModule,
    DialogModule,
    SpeedDialModule,
    SplitButtonModule,
    StepsModule
  ],
  providers: [MessageService]
})
export class SharedModule { } 