import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-advanced-filters-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatExpansionModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule
  ],
  template: `
    <div class="advanced-filters-dialog-content">
      <div class="dialog-header">
        <h2>Erweiterte Filter</h2>
        <button mat-icon-button (click)="close()" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="dialog-body">
        <!-- Modi (Modes) -->
        <mat-expansion-panel [expanded]="true" class="mb-2">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <span>Modi</span>
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="filter-content">
            <div class="modes-grid">
              @for (mode of modes; track mode.id) {
                <button
                  mat-icon-button
                  [class.selected]="isModeSelected(mode.id)"
                  (click)="toggleMode(mode.id)"
                  [title]="mode.label"
                  class="mode-button">
                  <mat-icon>{{ mode.icon }}</mat-icon>
                </button>
              }
            </div>
            <button mat-icon-button class="info-button" title="Info">
              <mat-icon>info</mat-icon>
            </button>
          </div>
        </mat-expansion-panel>

        <!-- Personas -->
        <mat-expansion-panel [expanded]="true" class="mb-2">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <span>Personas</span>
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="filter-content">
            <p>{{ allPersonasSelected ? 'alle Personas aktiviert' : 'Personas ausgewählt' }}</p>
            <button mat-icon-button class="info-button" title="Info">
              <mat-icon>info</mat-icon>
            </button>
          </div>
        </mat-expansion-panel>

        <!-- Aktivitäten (Activities) -->
        <mat-expansion-panel [expanded]="true" class="mb-2">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <span>Aktivitäten</span>
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="filter-content">
            <p>{{ allActivitiesSelected ? 'alle Aktivitäten aktiviert' : 'Aktivitäten ausgewählt' }}</p>
            <button mat-icon-button class="info-button" title="Info">
              <mat-icon>info</mat-icon>
            </button>
          </div>
        </mat-expansion-panel>

        <!-- Regionalklassen (Regional Classes) -->
        <mat-expansion-panel [expanded]="true" class="mb-2">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <span>Regionalklassen</span>
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="filter-content">
            <!-- Großstädte -->
            <mat-expansion-panel [expanded]="regionalClassesExpanded.majorCities" class="nested-panel mb-2">
              <mat-expansion-panel-header>
                <mat-panel-title>Großstädte</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="nested-content">
                @for (city of regionalClasses.majorCities; track city) {
                  <mat-checkbox [checked]="true">{{ city }}</mat-checkbox>
                }
              </div>
            </mat-expansion-panel>

            <!-- Städtisch -->
            <mat-expansion-panel [expanded]="regionalClassesExpanded.urban" class="nested-panel mb-2">
              <mat-expansion-panel-header>
                <mat-panel-title>Städtisch</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="nested-content">
                @for (urban of regionalClasses.urban; track urban) {
                  <mat-checkbox [checked]="true">{{ urban }}</mat-checkbox>
                }
              </div>
            </mat-expansion-panel>

            <!-- Vorstadt & Umland -->
            <mat-expansion-panel [expanded]="regionalClassesExpanded.suburb" class="nested-panel mb-2">
              <mat-expansion-panel-header>
                <mat-panel-title>Vorstadt & Umland</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="nested-content">
                @if (regionalClasses.suburb.length === 0) {
                  <p>Keine Einträge</p>
                } @else {
                  @for (suburb of regionalClasses.suburb; track suburb) {
                    <mat-checkbox [checked]="true">{{ suburb }}</mat-checkbox>
                  }
                }
              </div>
            </mat-expansion-panel>

            <!-- Ländlicher Raum -->
            <mat-expansion-panel [expanded]="regionalClassesExpanded.rural" class="nested-panel mb-2">
              <mat-expansion-panel-header>
                <mat-panel-title>Ländlicher Raum</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="nested-content">
                @for (rural of regionalClasses.rural; track rural) {
                  <mat-checkbox [checked]="true">{{ rural }}</mat-checkbox>
                }
              </div>
            </mat-expansion-panel>

            <button mat-icon-button class="info-button" title="Info">
              <mat-icon>info</mat-icon>
            </button>
          </div>
        </mat-expansion-panel>
      </div>

      <div class="dialog-footer">
        <button mat-button (click)="close()">Abbrechen</button>
        <button mat-raised-button color="primary" (click)="submit()">Übernehmen</button>
      </div>
    </div>
  `,
  styles: [`
    .advanced-filters-dialog-content {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--dark-background-color, #2c104c);
      color: var(--secondary-text-color, #ffffff);
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dialog-header h2 {
      margin: 0;
      color: var(--secondary-text-color, #ffffff);
    }

    .close-button {
      color: var(--secondary-text-color, #ffffff);
    }

    .dialog-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .filter-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .filter-content p {
      color: var(--secondary-text-color, #ffffff);
      margin: 0;
      font-size: 0.875rem;
    }

    .info-button {
      align-self: flex-start;
      margin-top: 0.5rem;
      color: var(--secondary-text-color, #ffffff);
    }

    .nested-panel {
      margin-bottom: 0.5rem;
    }

    .nested-content {
      padding: 0.5rem;
    }

    .nested-content mat-checkbox {
      color: var(--secondary-text-color, #ffffff);
    }

    .modes-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .mode-button {
      border: 2px solid transparent;
      border-radius: 4px;
      transition: all 0.2s;
      color: var(--secondary-text-color, #ffffff);
      width: 100%;
      aspect-ratio: 1;
    }

    .mode-button.selected {
      border-color: var(--primary-color, #482683);
      background-color: rgba(72, 38, 131, 0.2);
    }

    .mode-button:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    ::ng-deep .advanced-filters-dialog .mat-mdc-dialog-container {
      padding: 0;
    }

    ::ng-deep .advanced-filters-dialog .mat-expansion-panel {
      margin-bottom: 0.75rem !important;
      background-color: rgba(208, 187, 219, 0.15) !important;
      box-shadow: none !important;
      border-radius: 8px !important;
    }

    ::ng-deep .advanced-filters-dialog .mat-expansion-panel-header {
      padding: 1rem 1.25rem !important;
      background-color: rgba(208, 187, 219, 0.15) !important;
      color: var(--secondary-text-color, #ffffff) !important;
    }

    ::ng-deep .advanced-filters-dialog .mat-expansion-panel-body {
      padding: 1rem 1.25rem !important;
      background-color: rgba(208, 187, 219, 0.15) !important;
      color: var(--secondary-text-color, #ffffff) !important;
    }
  `]
})
export class AdvancedFiltersDialogComponent {
  selectedModes: string[];
  modes: any[];
  allPersonasSelected: boolean;
  allActivitiesSelected: boolean;
  regionalClassesExpanded: any;
  regionalClasses: any;

  constructor(
    public dialogRef: MatDialogRef<AdvancedFiltersDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.selectedModes = [...data.selectedModes];
    this.modes = data.modes;
    this.allPersonasSelected = data.allPersonasSelected;
    this.allActivitiesSelected = data.allActivitiesSelected;
    this.regionalClassesExpanded = { ...data.regionalClassesExpanded };
    this.regionalClasses = data.regionalClasses;
  }

  toggleMode(modeId: string): void {
    const index = this.selectedModes.indexOf(modeId);
    if (index > -1) {
      this.selectedModes.splice(index, 1);
    } else {
      this.selectedModes.push(modeId);
    }
  }

  isModeSelected(modeId: string): boolean {
    return this.selectedModes.includes(modeId);
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.dialogRef.close({
      selectedModes: this.selectedModes,
      allPersonasSelected: this.allPersonasSelected,
      allActivitiesSelected: this.allActivitiesSelected,
      regionalClassesExpanded: this.regionalClassesExpanded,
      regionalClasses: this.regionalClasses
    });
  }
}
