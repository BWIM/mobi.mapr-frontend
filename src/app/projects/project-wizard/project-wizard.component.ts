import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { MenuItem } from 'primeng/api';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProjectsService } from '../projects.service';
import { ActivitiesService } from '../../services/activities.service';
import { PersonasService } from '../../services/personas.service';
import { ModesService } from '../../services/modes.service';
import { Router } from '@angular/router';
import { ProjectWizardService } from './project-wizard.service';
import { Subscription } from 'rxjs';
import { GroupedActivities } from '../../services/interfaces/activity.interface';
import { Persona } from '../../services/interfaces/persona.interface';
import { Mode } from '../../services/interfaces/mode.interface';
import { AreaSelectionComponent } from './area-selection/area-selection.component';

@Component({
  selector: 'app-project-wizard',
  templateUrl: './project-wizard.component.html',
  styleUrls: ['./project-wizard.component.css'],
  standalone: true,
  imports: [SharedModule, AreaSelectionComponent]
})
export class ProjectWizardComponent implements OnInit, OnDestroy {
  steps: MenuItem[] = [];
  activeIndex: number = 0;
  projectForm: FormGroup;
  visible: boolean = false;
  groupedActivities: GroupedActivities[] = [];
  personas: Persona[] = [];
  modes: Mode[] = [];
  private subscription: Subscription;

  constructor(
    private fb: FormBuilder,
    private projectsService: ProjectsService,
    private activitiesService: ActivitiesService,
    private personasService: PersonasService,
    private modesService: ModesService,
    private router: Router,
    private wizardService: ProjectWizardService
  ) {
    this.subscription = this.wizardService.visible$.subscribe(
      visible => this.visible = visible
    );

    this.projectForm = this.fb.group({
      // Schritt 1: Aktivitäten
      activities: this.fb.group({
        selectedActivities: [[], Validators.required]
      }),
      // Schritt 2: Personas
      personas: this.fb.group({
        selectedPersonas: [[], Validators.required]
      }),
      // Schritt 3: Modi
      modes: this.fb.group({
        selectedModes: [[], Validators.required]
      }),
      // Schritt 4: Gebiet auswählen
      area: this.fb.group({
        selectedArea: ['', Validators.required]
      }),
      // Schritt 5: Zusammenfassung
      summary: this.fb.group({
        name: ['', Validators.required],
        description: [''],
        isPublic: [false],
        allowSharing: [false]
      })
    });
  }

  ngOnInit() {
    this.initializeSteps();
    this.loadActivities();
    this.loadPersonas();
    this.loadModes();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private loadActivities() {
    this.activitiesService.getGroupedActivities().subscribe({
      next: (groupedActivities) => {
        this.groupedActivities = groupedActivities;
        // Alle Aktivitäten automatisch auswählen
        const allActivities = this.groupedActivities.flatMap(group => group.activities);
        this.projectForm.get('activities.selectedActivities')?.setValue(allActivities);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Aktivitäten:', error);
      }
    });
  }

  private loadPersonas() {
    this.personasService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas.results.sort((a, b) => 
          (a.display_name || a.name).localeCompare(b.display_name || b.name)
        );
        // Alle Personas automatisch auswählen
        this.projectForm.get('personas.selectedPersonas')?.setValue(this.personas);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Personas:', error);
      }
    });
  }

  private loadModes() {
    this.modesService.getModes().subscribe({
      next: (modes) => {
        this.modes = modes.results;
        // Alle Modi automatisch auswählen
        this.projectForm.get('modes.selectedModes')?.setValue(this.modes);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Modi:', error);
      }
    });
  }

  private initializeSteps() {
    this.steps = [
      {
        label: 'Aktivitäten',
        command: (event: any) => {
          this.activeIndex = 0;
        }
      },
      {
        label: 'Personas',
        command: (event: any) => {
          this.activeIndex = 1;
        }
      },
      {
        label: 'Modi',
        command: (event: any) => {
          this.activeIndex = 2;
        }
      },
      {
        label: 'Gebiet auswählen',
        command: (event: any) => {
          this.activeIndex = 3;
        }
      },
      {
        label: 'Projektinformationen',
        command: (event: any) => {
          this.activeIndex = 4;
        }
      }
    ];
  }

  nextStep() {
    if (this.activeIndex < this.steps.length - 1) {
      this.activeIndex++;
    }
  }

  isCurrentStepValid(): boolean {
    switch (this.activeIndex) {
      case 0:
        return this.projectForm.get('activities.selectedActivities')?.value?.length > 0;
      case 1:
        return this.projectForm.get('personas.selectedPersonas')?.value?.length > 0;
      case 2:
        return this.projectForm.get('modes.selectedModes')?.value?.length > 0;
      case 3:
        return this.projectForm.get('area.selectedArea')?.value?.length > 0;
      case 4:
        return this.projectForm.get('summary.name')?.value?.length > 0;
      default:
        return false;
    }
  }

  prevStep() {
    if (this.activeIndex > 0) {
      this.activeIndex--;
    }
  }

  hide() {
    this.wizardService.hide();
  }

  selectAllActivities(activities: any[]) {
    const currentSelection = this.projectForm.get('activities.selectedActivities')?.value || [];
    const newSelection = [...new Set([...currentSelection, ...activities])];
    this.projectForm.get('activities.selectedActivities')?.setValue(newSelection);
  }

  deselectAllActivities(activities: any[]) {
    const currentSelection = this.projectForm.get('activities.selectedActivities')?.value || [];
    const newSelection = currentSelection.filter((item: any) => 
      !activities.some(activity => activity.id === item.id)
    );
    this.projectForm.get('activities.selectedActivities')?.setValue(newSelection);
  }

  selectAllPersonas() {
    this.projectForm.get('personas.selectedPersonas')?.setValue([...this.personas]);
  }

  deselectAllPersonas() {
    this.projectForm.get('personas.selectedPersonas')?.setValue([]);
  }

  selectAllModes() {
    this.projectForm.get('modes.selectedModes')?.setValue([...this.modes]);
  }

  deselectAllModes() {
    this.projectForm.get('modes.selectedModes')?.setValue([]);
  }

  onSubmit() {
    if (this.projectForm.valid) {
      const projectData = {
        name: this.projectForm.get('summary.name')?.value,
        description: this.projectForm.get('summary.description')?.value,
        is_public: this.projectForm.get('summary.isPublic')?.value,
        allow_sharing: this.projectForm.get('summary.allowSharing')?.value,
        activities: this.projectForm.get('activities.selectedActivities')?.value.map((a: any) => a.id),
        personas: this.projectForm.get('personas.selectedPersonas')?.value.map((p: any) => p.id),
        modes: this.projectForm.get('modes.selectedModes')?.value.map((m: any) => m.id),
        areas: this.projectForm.get('area.selectedArea')?.value
      };

      this.projectsService.createProject(projectData).subscribe({
        next: (response) => {
          this.hide();
          this.router.navigate(['/projects']);
        },
        error: (error) => {
          console.error('Fehler beim Erstellen des Projekts:', error);
        }
      });
    }
  }
} 