import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { ActivityService } from '../../../services/activity.service';
import { PersonaService } from '../../../services/persona.service';
import { RegioStarService } from '../../../services/regiostar.service';
import { StateService } from '../../../services/state.service';
import { Activity } from '../../../interfaces/activity';
import { Persona } from '../../../interfaces/persona';
import { RegioStar } from '../../../interfaces/regiostar';
import { State } from '../../../interfaces/features';
import { SharedModule } from '../../../shared/shared.module';

export interface FilterDialogData {
  selectedActivities: number[];
  selectedPersonas: number[];
  selectedRegioStars: number[];
  selectedStates: number[];
  is_mid?: boolean;
}

@Component({
  selector: 'app-filter-dialog',
  standalone: true,
  imports: [
    SharedModule,
  ],
  templateUrl: './filter-dialog.component.html',
  styleUrl: './filter-dialog.component.css'
})
export class FilterDialogComponent implements OnInit {
  activities: Activity[] = [];
  personas: Persona[] = [];
  regiostars: RegioStar[] = [];
  states: State[] = [];

  selectedActivities: Set<number> = new Set();
  selectedPersonas: Set<number> = new Set();
  selectedRegioStars: Set<number> = new Set();
  selectedStates: Set<number> = new Set();

  is_mid: boolean = true;

  loading = {
    activities: true,
    personas: true,
    regiostars: true,
    states: true
  };

  constructor(
    public dialogRef: MatDialogRef<FilterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FilterDialogData,
    private activityService: ActivityService,
    private personaService: PersonaService,
    private regiostarService: RegioStarService,
    private stateService: StateService
  ) {
    // Initialize selections from data
    this.selectedActivities = new Set(data.selectedActivities || []);
    this.selectedPersonas = new Set(data.selectedPersonas || []);
    this.selectedRegioStars = new Set(data.selectedRegioStars || []);
    this.selectedStates = new Set(data.selectedStates || []);
    this.is_mid = data.is_mid !== undefined ? data.is_mid : true;
  }

  ngOnInit() {
    if (this.is_mid) {
      this.loadActivities();
      this.loadPersonas();
    }
    this.loadRegioStars();
    this.loadStates();
  }

  loadActivities() {
    this.loading.activities = true;
    this.activityService.getActivities(1, 100).subscribe({
      next: (response) => {
        this.activities = response.results;
        this.loading.activities = false;
      },
      error: (error) => {
        console.error('Error loading activities:', error);
        this.loading.activities = false;
      }
    });
  }

  loadPersonas() {
    this.loading.personas = true;
    this.personaService.getPersonas(1, 100).subscribe({
      next: (response) => {
        this.personas = response.results;
        this.loading.personas = false;
      },
      error: (error) => {
        console.error('Error loading personas:', error);
        this.loading.personas = false;
      }
    });
  }

  loadRegioStars() {
    this.loading.regiostars = true;
    this.regiostarService.getRegioStars(1, 100).subscribe({
      next: (response) => {
        this.regiostars = response.results;
        this.loading.regiostars = false;
      },
      error: (error) => {
        console.error('Error loading regiostars:', error);
        this.loading.regiostars = false;
      }
    });
  }

  loadStates() {
    this.loading.states = true;
    this.stateService.getStates(1, 100).subscribe({
      next: (response) => {
        this.states = response.results;
        this.loading.states = false;
      },
      error: (error) => {
        console.error('Error loading states:', error);
        this.loading.states = false;
      }
    });
  }

  toggleActivity(id: number) {
    if (this.selectedActivities.has(id)) {
      this.selectedActivities.delete(id);
    } else {
      this.selectedActivities.add(id);
    }
  }

  togglePersona(id: number) {
    if (this.selectedPersonas.has(id)) {
      this.selectedPersonas.delete(id);
    } else {
      this.selectedPersonas.add(id);
    }
  }

  toggleRegioStar(id: number) {
    if (this.selectedRegioStars.has(id)) {
      this.selectedRegioStars.delete(id);
    } else {
      this.selectedRegioStars.add(id);
    }
  }

  toggleState(id: number) {
    if (this.selectedStates.has(id)) {
      this.selectedStates.delete(id);
    } else {
      this.selectedStates.add(id);
    }
  }

  isActivitySelected(id: number): boolean {
    return this.selectedActivities.has(id);
  }

  isPersonaSelected(id: number): boolean {
    return this.selectedPersonas.has(id);
  }

  isRegioStarSelected(id: number): boolean {
    return this.selectedRegioStars.has(id);
  }

  isStateSelected(id: number): boolean {
    return this.selectedStates.has(id);
  }

  selectAllActivities() {
    if (this.selectedActivities.size === this.activities.length) {
      this.selectedActivities.clear();
    } else {
      this.activities.forEach(activity => this.selectedActivities.add(activity.id));
    }
  }

  selectAllPersonas() {
    if (this.selectedPersonas.size === this.personas.length) {
      this.selectedPersonas.clear();
    } else {
      this.personas.forEach(persona => this.selectedPersonas.add(persona.id));
    }
  }

  selectAllRegioStars() {
    if (this.selectedRegioStars.size === this.regiostars.length) {
      this.selectedRegioStars.clear();
    } else {
      this.regiostars.forEach(regiostar => this.selectedRegioStars.add(regiostar.id));
    }
  }

  selectAllStates() {
    if (this.selectedStates.size === this.states.length) {
      this.selectedStates.clear();
    } else {
      this.states.forEach(state => this.selectedStates.add(state.id));
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  onApply() {
    this.dialogRef.close({
      selectedActivities: Array.from(this.selectedActivities),
      selectedPersonas: Array.from(this.selectedPersonas),
      selectedRegioStars: Array.from(this.selectedRegioStars),
      selectedStates: Array.from(this.selectedStates)
    });
  }
}
