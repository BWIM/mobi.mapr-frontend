import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { AdvancedFiltersDialogComponent } from './advanced-filters-dialog.component';

@Component({
  selector: 'app-filter-view',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    TranslateModule
  ],
  templateUrl: './filter-view.component.html',
  styleUrl: './filter-view.component.css'
})
export class FilterViewComponent {
  constructor(private dialog: MatDialog) {}

  // Modes - all selected by default
  selectedModes: string[] = ['train', 'bicycle', 'car', 'walking'];
  modes = [
    { id: 'train', label: 'ÖPNV', icon: 'train' },
    { id: 'bicycle', label: 'Fahrrad', icon: 'directions_bike' },
    { id: 'car', label: 'Auto', icon: 'directions_car' },
    { id: 'walking', label: 'Zu Fuß', icon: 'directions_walk' }
  ];

  // Personas
  allPersonasSelected: boolean = true;

  // Activities
  allActivitiesSelected: boolean = true;

  // Evaluation
  evaluationType: 'travelTime' | 'activityIndex' = 'travelTime';
  
  // Evaluation icons
  evaluationOptions = [
    { value: 'travelTime', label: 'Mobilitätszeit', icon: 'schedule' },
    { value: 'activityIndex', label: 'Mobilitätsqualität', icon: 'bar_chart' }
  ];

  // Regional Classes - with expanded state
  regionalClassesExpanded = {
    majorCities: true,
    urban: true,
    suburb: false,
    rural: true
  };

  regionalClasses = {
    majorCities: ['Metropole (Stadtregion)', 'Regiopole und Großstadt (Stadtregion)'],
    urban: ['Mittelstädte, städtischer Raum (Stadtregion)'],
    suburb: [],
    rural: ['Kleinstädtischer, dörflicher Raum (Ländliche Region)']
  };

  toggleMode(modeId: string): void {
    const index = this.selectedModes.indexOf(modeId);
    if (index > -1) {
      this.selectedModes.splice(index, 1);
    } else {
      this.selectedModes.push(modeId);
    }
    // TODO: Emit filter change event
    console.log('Selected modes:', this.selectedModes);
  }

  isModeSelected(modeId: string): boolean {
    return this.selectedModes.includes(modeId);
  }

  toggleAllPersonas(): void {
    this.allPersonasSelected = !this.allPersonasSelected;
    // TODO: Emit filter change event
    console.log('All personas selected:', this.allPersonasSelected);
  }

  toggleAllActivities(): void {
    this.allActivitiesSelected = !this.allActivitiesSelected;
    // TODO: Emit filter change event
    console.log('All activities selected:', this.allActivitiesSelected);
  }

  setEvaluationType(type: string): void {
    this.evaluationType = type as 'travelTime' | 'activityIndex';
    // TODO: Emit filter change event
    console.log('Evaluation type:', this.evaluationType);
  }

  openAdvancedFilters(): void {
    const dialogRef = this.dialog.open(AdvancedFiltersDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      height: '90vh',
      maxHeight: '800px',
      panelClass: 'advanced-filters-dialog',
      data: {
        selectedModes: [...this.selectedModes],
        modes: this.modes,
        allPersonasSelected: this.allPersonasSelected,
        allActivitiesSelected: this.allActivitiesSelected,
        regionalClassesExpanded: this.regionalClassesExpanded,
        regionalClasses: this.regionalClasses
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Apply the filter changes
        this.selectedModes = result.selectedModes;
        this.allPersonasSelected = result.allPersonasSelected;
        this.allActivitiesSelected = result.allActivitiesSelected;
        this.regionalClassesExpanded = result.regionalClassesExpanded;
        // TODO: Emit filter change event
        console.log('Filters applied:', result);
      }
    });
  }
}
