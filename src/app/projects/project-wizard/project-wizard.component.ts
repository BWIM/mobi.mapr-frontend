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
import { TranslateService } from '@ngx-translate/core';
import { ProjectsReloadService } from '../projects-reload.service';
import { Activity } from '../../services/interfaces/activity.interface';
import { ProjectGroup } from '../project.interface';
import { MessageService } from 'primeng/api';
import { MapService } from '../../map/map.service';
import { AreasService } from '../../services/areas.service';


@Component({
  selector: 'app-project-wizard',
  templateUrl: './project-wizard.component.html',
  styleUrls: ['./project-wizard.component.css'],
  standalone: true,
  imports: [SharedModule, AreaSelectionComponent],
  providers: [MessageService]
})
export class ProjectWizardComponent implements OnInit, OnDestroy {
  steps: MenuItem[] = [];
  activeIndex: number = 0;
  projectForm!: FormGroup;
  visible: boolean = false;
  groupedActivities: GroupedActivities[] = [];
  personas: Persona[] = [];
  modes: Mode[] = [];
  projectGroups: ProjectGroup[] = [];
  private subscription: Subscription;
  selectedAreaIds: string[] = [];
  showMidActivities: boolean = true;
  selectedGroupToDelete: ProjectGroup | null = null;
  hasCompletelySelectedLands: boolean = false;
  areasGeoJson: any = null;
  private allGroupedActivities: { mid: GroupedActivities[], nonMid: GroupedActivities[] } = {
    mid: [],
    nonMid: []
  };

  constructor(
    private fb: FormBuilder,
    private projectsService: ProjectsService,
    private activitiesService: ActivitiesService,
    private personasService: PersonasService,
    private modesService: ModesService,
    private router: Router,
    private wizardService: ProjectWizardService,
    private translate: TranslateService,
    private reloadService: ProjectsReloadService,
    private messageService: MessageService,
    private mapService: MapService,
    private areasService: AreasService
  ) {
    this.subscription = this.wizardService.visible$.subscribe(
      visible => {
        this.visible = visible;
        if (visible) {
          this.resetWizard();
          this.loadProjectGroups();
          this.loadAreas();
        }
      }
    );

    this.initializeForm();
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

  private initializeForm() {
    this.projectForm = this.fb.group({
      // Schritt 1: Aktivitäten
      activities: this.fb.group({
        selectedMidActivities: [[]],  // Kein required, wird manuell validiert
        selectedNonMidActivity: ['']  // Kein required, wird manuell validiert
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
        selectedArea: [[], Validators.required]
      }),
      // Schritt 5: Zusammenfassung
      summary: this.fb.group({
        name: ['', Validators.required],
        description: [''],
        isPublic: [false],
        allowSharing: [false],
        sendEmail: [true],
        loadAreasOnMap: [true],
        projectGroup: [null],
      })
    });
  }

  private resetWizard() {
    // Formular zurücksetzen
    this.projectForm.reset();
    
    // Aktivitäten-Auswahl zurücksetzen
    this.showMidActivities = true;
    if (this.allGroupedActivities.mid.length > 0) {
      this.updateDisplayedActivities(true);
    }
    
    // Ausgewählte Gebiete zurücksetzen
    this.selectedAreaIds = [];
    
    // Wizard zum ersten Schritt zurücksetzen
    this.activeIndex = 0;
    
    // Standard-Werte für die Zusammenfassung setzen
    this.projectForm.patchValue({
      summary: {
        isPublic: false,
        allowSharing: false,
        sendEmail: true,
        loadAreasOnMap: true,
      }
    });

    // Wenn Personas und Modi bereits geladen sind, diese automatisch auswählen
    if (this.personas.length > 0) {
      this.projectForm.get('personas.selectedPersonas')?.setValue(this.personas);
    }
    if (this.modes.length > 0) {
      this.projectForm.get('modes.selectedModes')?.setValue(this.modes);
    }
  }

  private loadActivities() {
    this.activitiesService.getActivities().subscribe({
      next: (response) => {
        // Gruppiere alle Aktivitäten nach mid/non-mid
        const midActivities = response.results.filter(activity => activity.mid === true);
        const nonMidActivities = response.results.filter(activity => activity.mid === false);

        // Gruppiere nach Wegezweck
        this.allGroupedActivities.mid = this.groupActivitiesByPurpose(midActivities);
        this.allGroupedActivities.nonMid = this.groupActivitiesByPurpose(nonMidActivities);
        
        // Setze initial die MID-Aktivitäten
        this.updateDisplayedActivities(true);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Aktivitäten:', error);
      }
    });
  }

  private groupActivitiesByPurpose(activities: Activity[]): GroupedActivities[] {
    const grouped = activities.reduce((groups: { [key: string]: Activity[] }, activity) => {
      const wegezweckId = activity.wegezweck || 'undefined';
      if (!groups[wegezweckId]) {
        groups[wegezweckId] = [];
      }
      groups[wegezweckId].push(activity);
      return groups;
    }, {});

    return Object.entries(grouped)
      .map(([_, activities]) => ({
        tripPurpose: activities[0].wegezweck!,
        activities: activities.sort((a, b) => a.display_name.localeCompare(b.display_name))
      }))
      .sort((a, b) => a.tripPurpose.localeCompare(b.tripPurpose));
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
      // Wenn wir im Aktivitäten-Schritt sind und eine Nicht-MID-Aktivität ausgewählt wurde
      if (this.activeIndex === 0 && !this.showMidActivities && this.projectForm.get('activities.selectedNonMidActivity')?.value) {
        // Überspringe Personas (Index 1) und gehe direkt zu Modi (Index 2)
        this.activeIndex = 2;
        // Setze alle Personas als ausgewählt
        this.selectAllPersonas();
      } else {
        this.activeIndex++;
      }
    }
  }

  prevStep() {
    if (this.activeIndex > 0) {
      // Wenn wir bei Modi sind und eine Nicht-MID-Aktivität ausgewählt ist
      if (this.activeIndex === 2 && !this.showMidActivities && this.projectForm.get('activities.selectedNonMidActivity')?.value) {
        // Springe direkt zurück zu Aktivitäten
        this.activeIndex = 0;
      } else {
        this.activeIndex--;
      }
    }
  }

  isCurrentStepValid(): boolean {
    switch (this.activeIndex) {
      case 0: // Aktivitäten
        if (this.showMidActivities) {
          const midActivities = this.projectForm.get('activities.selectedMidActivities')?.value || [];
          return midActivities.length > 0;
        } else {
          const nonMidActivity = this.projectForm.get('activities.selectedNonMidActivity')?.value;
          return !!nonMidActivity;
        }
      case 1:
        return this.projectForm.get('personas.selectedPersonas')?.value?.length > 0;
      case 2:
        return this.projectForm.get('modes.selectedModes')?.value?.length > 0;
      case 3:
        return this.selectedAreaIds.length > 0;
      case 4:
        return this.projectForm.get('summary.name')?.value?.length > 0;
      default:
        return false;
    }
  }

  hide() {
    this.wizardService.hide();
  }

  selectAllActivities(activities: any[]) {
    const currentSelection = this.projectForm.get('activities.selectedMidActivities')?.value || [];
    const newSelection = [...new Set([...currentSelection, ...activities])];
    this.projectForm.get('activities.selectedMidActivities')?.setValue(newSelection);
  }

  deselectAllActivities(activities: any[]) {
    const currentSelection = this.projectForm.get('activities.selectedMidActivities')?.value || [];
    const newSelection = currentSelection.filter((item: any) => 
      !activities.some(activity => activity.id === item.id)
    );
    this.projectForm.get('activities.selectedMidActivities')?.setValue(newSelection);
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

  onAreaSelectionChange(areaIds: string[]) {
    this.selectedAreaIds = areaIds;
    this.projectForm.get('area.selectedArea')?.setValue(areaIds);
  }

  onCompletelySelectedLandsChange(hasCompletelySelectedLands: boolean) {
    this.hasCompletelySelectedLands = hasCompletelySelectedLands;
  }

  onSubmit() {
    // Prüfe die Validität aller Schritte
    const isValid = [0, 1, 2, 3, 4].every(step => {
      const wasValid = this.isCurrentStepValid();
      if (!wasValid) {
        console.log(`Schritt ${step} ist ungültig`);
      }
      return wasValid;
    });

    if (isValid) {
      const selectedMidActivities = this.projectForm.get('activities.selectedMidActivities')?.value || [];
      const selectedNonMidActivity = this.projectForm.get('activities.selectedNonMidActivity')?.value;
      
      const allSelectedActivities = [...selectedMidActivities];
      if (selectedNonMidActivity) {
        allSelectedActivities.push(selectedNonMidActivity);
      }

      const projectData = {
        name: this.projectForm.get('summary.name')?.value,
        description: this.projectForm.get('summary.description')?.value,
        mail: this.projectForm.get('summary.sendEmail')?.value,
        infos: this.projectForm.get('summary.loadAreasOnMap')?.value,
        activities: allSelectedActivities.map((a: any) => a.id).join(','),
        personas: this.projectForm.get('personas.selectedPersonas')?.value.map((p: any) => p.id).join(','),
        modes: this.projectForm.get('modes.selectedModes')?.value.map((m: any) => m.id).join(','),
        landkreise: this.selectedAreaIds.join(','),
        projectgroup: this.projectForm.get('summary.projectGroup')?.value?.id || null,
        laender: this.hasCompletelySelectedLands
      };


      this.projectsService.createProject(projectData).subscribe({
        next: (response) => {
          if (!response) {
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('COMMON.MESSAGES.ERROR.CREATE'),
              detail: this.translate.instant('PROJECTS.MESSAGES.CREATE_ERROR')
            });
            return;
          }
          this.mapService.resetMap();
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.CREATE'),
            detail: this.translate.instant('PROJECTS.MESSAGES.CREATE_SUCCESS')
          });
          this.reloadService.triggerReload();
          this.hide();
        },
        error: (error) => {
          console.error('Fehler beim Erstellen des Projekts:', error);
          let errorMessage = this.translate.instant('PROJECTS.MESSAGES.CREATE_ERROR');
          
          if (error.error && error.error.detail) {
            errorMessage = error.error.detail;
          } else if (error.status === 400) {
            errorMessage = this.translate.instant('PROJECTS.MESSAGES.INVALID_DATA');
          } else if (error.status === 403) {
            errorMessage = this.translate.instant('PROJECTS.MESSAGES.PERMISSION_DENIED');
          } else if (error.status === 500) {
            errorMessage = this.translate.instant('PROJECTS.MESSAGES.SERVER_ERROR');
          }

          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.CREATE'),
            detail: errorMessage
          });
        }
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('COMMON.MESSAGES.ERROR.CREATE'),
        detail: this.translate.instant('PROJECTS.MESSAGES.FORM_INVALID')
      });
    }
  }

  toggleMidActivities() {
    this.showMidActivities = !this.showMidActivities;
    this.updateDisplayedActivities(this.showMidActivities);
  }

  private updateDisplayedActivities(showMid: boolean) {
    this.groupedActivities = showMid ? this.allGroupedActivities.mid : this.allGroupedActivities.nonMid;
    if (showMid) {
      const allMidActivities = this.groupedActivities.flatMap(group => group.activities);
      this.projectForm.get('activities.selectedMidActivities')?.setValue(allMidActivities);
    } else {
      this.projectForm.get('activities.selectedNonMidActivity')?.setValue('');
    }
  }

  private loadProjectGroups() {
    this.projectsService.getProjectGroups().subscribe({
      next: (response) => {
        this.projectGroups = response.results.sort((a, b) => a.name.localeCompare(b.name));
      },
      error: (error) => {
        console.error('Fehler beim Laden der Projektgruppen:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
          detail: this.translate.instant('PROJECTS.MESSAGES.LOAD_GROUPS_ERROR')
        });
      }
    });
  }

  deleteProjectGroup(group: ProjectGroup | null) {
    if (!group) return;

    // Bestätigungsdialog anzeigen
    if (confirm(this.translate.instant('PROJECTS.MESSAGES.CONFIRM_DELETE_GROUP'))) {
      this.projectsService.deleteProjectGroup(group.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.DELETE'),
            detail: this.translate.instant('PROJECTS.MESSAGES.DELETE_GROUP_SUCCESS')
          });
          
          // Aktualisiere die Liste der Projektgruppen
          this.loadProjectGroups();
          
          // Setze die Auswahl zurück
          this.selectedGroupToDelete = null;
          
          // Wenn die gelöschte Gruppe im Formular ausgewählt war, setze sie zurück
          if (this.projectForm.get('summary.projectGroup')?.value?.id === group.id) {
            this.projectForm.get('summary.projectGroup')?.setValue(null);
          }
        },
        error: (error) => {
          console.error('Fehler beim Löschen der Projektgruppe:', error);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.DELETE'),
            detail: this.translate.instant('PROJECTS.MESSAGES.DELETE_GROUP_ERROR')
          });
        }
      });
    }
  }

  private loadAreas() {
    if (!this.areasGeoJson) {
      this.areasService.getAreas().subscribe({
        next: (geojson: any) => {
          this.areasGeoJson = geojson;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Gebiete:', error);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
            detail: this.translate.instant('PROJECTS.MESSAGES.LOAD_AREAS_ERROR')
          });
        }
      });
    }
  }
} 