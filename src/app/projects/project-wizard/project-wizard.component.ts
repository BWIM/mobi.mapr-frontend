import { AfterViewInit, Component, HostListener, OnDestroy } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { MenuItem, MessageService } from 'primeng/api';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ProjectsService } from '../projects.service';
import { ActivitiesService } from '../../services/activities.service';
import { PersonasService } from '../../services/personas.service';
import { ModesService } from '../../services/modes.service';
import { ProjectWizardService } from './project-wizard.service';
import { Subscription } from 'rxjs';
import { GroupedActivities } from '../../services/interfaces/activity.interface';
import { Persona } from '../../services/interfaces/persona.interface';
import { Mode, Profile } from '../../services/interfaces/mode.interface';
import { TranslateService } from '@ngx-translate/core';
import { ProjectsReloadService } from '../projects-reload.service';
import { Activity } from '../../services/interfaces/activity.interface';
import { ProjectGroup, RegioStar } from '../project.interface';
import { AreasService } from '../../services/areas.service';
import { LandsService } from '../../services/lands.service';
import { RegioStarService } from '../../services/regiostar.service';
import { Land } from '../../services/interfaces/land.interface';
// OpenLayers imports
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';


@Component({
  selector: 'app-project-wizard',
  templateUrl: './project-wizard.component.html',
  styleUrls: ['./project-wizard.component.css'],
  standalone: true,
  imports: [SharedModule],
  providers: [MessageService]
})
export class ProjectWizardComponent implements AfterViewInit, OnDestroy {
  steps: MenuItem[] = [
    {
      label: 'PROJECT_WIZARD.STEPS.ACTIVITIES',
      command: (event: any) => {
        this.activeIndex = 0;
      }
    },
    {
      label: 'PROJECT_WIZARD.STEPS.PERSONAS',
      command: (event: any) => {
        this.activeIndex = 1;
      }
    },
    {
      label: 'PROJECT_WIZARD.STEPS.MODES',
      command: (event: any) => {
        this.activeIndex = 2;
      }
    },
    {
      label: 'PROJECT_WIZARD.STEPS.AREA',
      command: (event: any) => {
        this.activeIndex = 3;
        // Initialize map when directly selecting this step
        setTimeout(() => {
          this.initializeMap();
          this.setupAreaSelection();
        }, 0);
      }
    },
    {
      label: 'PROJECT_WIZARD.STEPS.PROJECT_INFO',
      command: (event: any) => {
        this.activeIndex = 4;
      }
    }
  ];
  activeIndex: number = 0;
  projectForm!: FormGroup;
  visible: boolean = false;
  groupedActivities: GroupedActivities[] = [];
  personas: Persona[] = [];
  modes: Mode[] = [];
  selectedModeMap: { [key: number]: boolean } = {};
  projectGroups: ProjectGroup[] = [];
  private subscription: Subscription;
  private langSubscription: Subscription;
  selectedAreaIds: string[] = [];
  showMidActivities: boolean = true;
  selectedGroupToDelete: ProjectGroup | null = null;
  hasCompletelySelectedLands: boolean = false;
  areasGeoJson: any = null;
  private allGroupedActivities: { mid: GroupedActivities[], nonMid: GroupedActivities[] } = {
    mid: [],
    nonMid: []
  };
  isMobile: boolean = false;
  activitiesLoaded: boolean = false;

  // Area selection properties
  lands: Land[] = [];
  private map?: Map;
  private vectorLayer?: VectorLayer<any>;
  private geoJsonFormat = new GeoJSON();
  private selectedFeatures: Set<string> = new Set();
  private overlay?: Overlay;
  private tooltipElement?: HTMLElement;

  selectedProfiles: { [key: number]: number } = {};
  profileControls: { [modeId: number]: FormControl } = {};

  // RegioStar properties
  regiostars: RegioStar[] = [];
  selectedRegioStars: RegioStar[] = [];

  constructor(
    private fb: FormBuilder,
    private projectsService: ProjectsService,
    private activitiesService: ActivitiesService,
    private personasService: PersonasService,
    private modesService: ModesService,
    private wizardService: ProjectWizardService,
    private translate: TranslateService,
    private reloadService: ProjectsReloadService,
    private messageService: MessageService,
    private areasService: AreasService,
    private landsService: LandsService,
    private regiostarService: RegioStarService
  ) {
    this.subscription = this.wizardService.visible$.subscribe(
      visible => {
        this.visible = visible;
        if (visible) {
          this.resetWizard();
          this.loadProjectGroups();
          this.loadAreas();
          this.loadLands();
          this.loadActivities();
          this.loadPersonas();
          this.loadModes();
          this.loadRegioStars();
        }
      }
    );

    // Subscribe to language changes
    this.langSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateStepLabels();
    });

    this.initializeForm();
    this.checkMobile();
    this.updateStepLabels(); // Initialize step labels
  }

  ngAfterViewInit() {
    this.updateStepLabels();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }

    // Clean up map resources
    if (this.map) {
      if (this.overlay) {
        this.map.removeOverlay(this.overlay);
      }
      this.map.dispose();
    }
  }

  private updateStepLabels() {
    this.steps = [
      {
        label: this.translate.instant('PROJECT_WIZARD.STEPS.ACTIVITIES'),
        command: (event: any) => {
          this.activeIndex = 0;
        }
      },
      {
        label: this.translate.instant('PROJECT_WIZARD.STEPS.PERSONAS'),
        command: (event: any) => {
          this.activeIndex = 1;
        }
      },
      {
        label: this.translate.instant('PROJECT_WIZARD.STEPS.MODES'),
        command: (event: any) => {
          this.activeIndex = 2;
        }
      },
      {
        label: this.translate.instant('PROJECT_WIZARD.STEPS.AREA'),
        command: (event: any) => {
          this.activeIndex = 3;
          // Initialize map when directly selecting this step
          setTimeout(() => {
            this.initializeMap();
            this.setupAreaSelection();
          }, 0);
        }
      },
      {
        label: this.translate.instant('PROJECT_WIZARD.STEPS.PROJECT_INFO'),
        command: (event: any) => {
          this.activeIndex = 4;
        }
      }
    ];
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
        selectedModes: [[]],
        selectedProfiles: this.fb.group({})
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
        loadAreasOnMap: [false],
        projectGroup: [null],
        startActivity: [null], // OSM activity selection
        regiostars: [[]] // RegioStar selection
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
    this.selectedFeatures.clear();

    // Reset land check status
    this.lands.forEach(land => {
      land.checked = false;
    });

    // Reset mode and profile selections
    this.selectedModeMap = {};
    this.selectedProfiles = {};

    // Reset regiostar selections
    this.selectedRegioStars = [];

    // Wizard zum ersten Schritt zurücksetzen
    this.activeIndex = 0;

    // Standard-Werte für die Zusammenfassung setzen
    this.projectForm.patchValue({
      summary: {
        isPublic: false,
        allowSharing: false,
        sendEmail: true,
        loadAreasOnMap: false,
      }
    });

    // Wenn Personas und Modi bereits geladen sind, diese automatisch auswählen
    if (this.personas.length > 0) {
      this.projectForm.get('personas.selectedPersonas')?.setValue(this.personas);
    }
    if (this.modes.length > 0) {
      this.selectAllModes();
    }

    // Reset the map if it exists
    if (this.map) {
      if (this.overlay) {
        this.map.removeOverlay(this.overlay);
      }
      this.map.dispose();
      this.map = undefined;
      this.vectorLayer = undefined;
    }
  }

  private loadActivities() {
    this.activitiesService.getActivities().subscribe({
      next: (response) => {
        // Group activities by mid flag and then by wegezweck
        const midActivities = response.results.filter(activity => activity.mid === true);
        const osmActivities = response.results.filter(activity => activity.mid === false);

        // Group by wegezweck
        this.allGroupedActivities.mid = this.groupActivitiesByPurpose(midActivities);
        this.allGroupedActivities.nonMid = this.groupActivitiesByPurpose(osmActivities);

        // Set initial display to MID activities
        this.updateDisplayedActivities(true);
        setTimeout(() => {
          this.activitiesLoaded = true;
        }, 100);
      },
      error: (error) => {
        console.error('Error loading activities:', error);
      }
    });
  }

  private groupActivitiesByPurpose(activities: Activity[]): GroupedActivities[] {
    const grouped = activities.reduce((groups: { [key: string]: Activity[] }, activity) => {
      const wegezweckId = activity.wegezweck || 'Other';
      if (!groups[wegezweckId]) {
        groups[wegezweckId] = [];
      }
      groups[wegezweckId].push(activity);
      return groups;
    }, {});

    return Object.entries(grouped)
      .map(([_, activities]) => ({
        tripPurpose: activities[0].wegezweck || 'Other',
        activities: activities.sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name))
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
        this.selectAllModes();
      },
      error: (error) => {
        console.error('Fehler beim Laden der Modi:', error);
      }
    });
  }

  nextStep() {
    if (this.activeIndex < this.steps.length - 1) {
      // If we're in the activities step and an OSM activity was selected
      if (this.activeIndex === 0 && !this.showMidActivities && this.projectForm.get('activities.selectedNonMidActivity')?.value) {
        // Skip personas (Index 1) and go directly to modes (Index 2)
        this.activeIndex = 2;
        // Select all personas automatically
        this.selectAllPersonas();
      } else {
        this.activeIndex++;
      }

      // If we're moving to step 4 (area selection), initialize the map
      if (this.activeIndex === 3) {
        setTimeout(() => {
          this.initializeMap();
          this.setupAreaSelection();
        }, 0);
      }
    }
  }

  prevStep() {
    if (this.activeIndex > 0) {
      // If we're at modes and an OSM activity is selected
      if (this.activeIndex === 2 && !this.showMidActivities && this.projectForm.get('activities.selectedNonMidActivity')?.value) {
        // Jump directly back to activities
        this.activeIndex = 0;
      } else {
        this.activeIndex--;
      }

      // If we're moving back to the area selection step, initialize the map
      if (this.activeIndex === 3) {
        setTimeout(() => {
          this.initializeMap();
          this.setupAreaSelection();
        }, 0);
      }
    }
  }

  isCurrentStepValid(): boolean {
    switch (this.activeIndex) {
      case 0: // Activities
        if (this.showMidActivities) {
          const midActivities = this.projectForm.get('activities.selectedMidActivities')?.value || [];
          return midActivities.length > 0;
        } else {
          const osmActivity = this.projectForm.get('activities.selectedNonMidActivity')?.value;
          return !!osmActivity;
        }
      case 1:
        return this.projectForm.get('personas.selectedPersonas')?.value?.length > 0;
      case 2:
        return this.areModesAndProfilesValid();
      case 3:
        return this.selectedAreaIds.length > 0;
      case 4:
        return this.projectForm.get('summary.name')?.value?.length > 0;
      default:
        return false;
    }
  }

  // Method to validate that modes and profiles are properly selected
  private areModesAndProfilesValid(): boolean {
    const selectedModeIds = this.projectForm.get('modes.selectedModes')?.value || [];

    if (selectedModeIds.length === 0) {
      return false;
    }

    // Check that all selected modes have valid profile selections if they have profiles
    for (const modeId of selectedModeIds) {
      const mode = this.modes.find(m => m.id === modeId);
      if (mode && mode.profiles && mode.profiles.length > 0) {
        const selectedProfile = this.selectedProfiles[modeId];
        if (!selectedProfile) {
          return false;
        }
      }
    }

    return true;
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
    // Clear existing selections
    this.selectedModeMap = {};
    this.selectedProfiles = {};

    // Initialize modes and their profiles
    this.modes.forEach(mode => {
      // Select all modes by default
      this.selectedModeMap[mode.id] = true;

      // Initialize profile selection with first profile ID if available
      if (mode.profiles && mode.profiles.length > 0) {
        const relevantProfile = mode.profiles.find(profile => profile.mode_default);
        if (relevantProfile) {
          this.selectedProfiles[mode.id] = relevantProfile.id;
        } else {
          this.selectedProfiles[mode.id] = mode.profiles[0].id;
        }
      }
    });

    // Update form with all selections
    this.updateModesForm();
  }

  deselectAllModes() {
    // Clear all mode selections
    this.selectedModeMap = {};
    this.selectedProfiles = {};

    // Update form with empty selections
    this.updateModesForm();
  }

  onModeChange(mode: Mode, checked: boolean) {
    this.selectedModeMap[mode.id] = checked;

    if (checked) {
      // When selecting a mode, ensure its first profile is selected
      if (mode.profiles && mode.profiles.length > 0) {
        const relevantProfile = mode.profiles.find(profile => profile.mode_default);
        if (relevantProfile) {
          this.selectedProfiles[mode.id] = relevantProfile.id;
        } else {
          this.selectedProfiles[mode.id] = mode.profiles[0].id;
        }
      }
    } else {
      // When deselecting a mode, remove its profile selection
      delete this.selectedProfiles[mode.id];
    }

    // Update form with current selections
    this.updateModesForm();
  }

  onProfileChange(mode: Mode, profileId: number) {
    this.selectedProfiles[mode.id] = profileId;

    // Update form with current selections
    this.updateModesForm();
  }

  getProfileFormControl(mode: Mode): FormControl {
    if (!this.profileControls[mode.id] && mode.profiles && mode.profiles.length > 0) {
      const relevantProfile = mode.profiles.find(profile => profile.mode_default);
      let profileControl;
      if (relevantProfile) {
        profileControl = new FormControl(relevantProfile.id);
      } else {
        profileControl = new FormControl(mode.profiles[0].id);
      }
      this.profileControls[mode.id] = profileControl;

      const profilesGroup = this.projectForm.get('modes.selectedProfiles') as FormGroup;
      profilesGroup.setControl(mode.id.toString(), profileControl);
    }
    return this.profileControls[mode.id];
  }

  isModeSelected(mode: Mode): boolean {
    return this.selectedModeMap[mode.id] || false;
  }

  getCurrentProfileId(mode: Mode): number | null {
    return this.selectedProfiles[mode.id] || null;
  }

  getSelectedProfile(mode: Mode): number | undefined {
    return this.selectedProfiles[mode.id];
  }

  // Helper method to update the form with current mode and profile selections
  private updateModesForm() {
    const selectedModeIds = this.modes
      .filter(m => this.selectedModeMap[m.id])
      .map(m => m.id);

    this.projectForm.patchValue({
      modes: {
        selectedModes: selectedModeIds,
        selectedProfiles: this.selectedProfiles
      }
    });
  }

  getCurrentStepLabel(): string {
    return this.steps[this.activeIndex]?.label || '';
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

      let allSelectedActivities = [...selectedMidActivities];
      let personas = this.projectForm.get('personas.selectedPersonas')?.value.map((p: any) => p.id).join(',');
      if (selectedNonMidActivity) {
        allSelectedActivities = [selectedNonMidActivity];
        personas = "";
      }

      // Get selected profiles only
      const selectedProfiles = Object.values(this.selectedProfiles).join(',');

      // Get selected regiostars
      const selectedRegioStars = this.projectForm.get('summary.regiostars')?.value || [];
      const regiostarValues = selectedRegioStars.map((rs: RegioStar) => rs.regiostar7).join(',');

      const projectData = {
        name: this.projectForm.get('summary.name')?.value,
        description: this.projectForm.get('summary.description')?.value,
        mail: this.projectForm.get('summary.sendEmail')?.value,
        infos: this.projectForm.get('summary.loadAreasOnMap')?.value,
        activities: allSelectedActivities.map((a: any) => a.id).join(','),
        personas: personas,
        profiles: selectedProfiles,
        landkreise: this.selectedAreaIds.join(','),
        projectgroup: this.projectForm.get('summary.projectGroup')?.value?.id || null,
        laender: this.hasCompletelySelectedLands,
        start_activity: this.projectForm.get('summary.startActivity')?.value?.id || null,
        regiostar: regiostarValues
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
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.CREATE'),
            detail: this.translate.instant('PROJECTS.MESSAGES.CREATE_SUCCESS')
          });

          // Simple retry mechanism: reload projects after a short delay
          setTimeout(() => {
            this.reloadService.triggerReload();
          }, 1000);

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

  toggleActivityType() {
    // Toggle between MID activities and OSM activities
    this.showMidActivities = !this.showMidActivities;
    this.updateDisplayedActivities(this.showMidActivities);
  }

  getOSMActivitiesList(): Activity[] {
    // Return a flat list of all OSM activities for the dropdown
    return this.allGroupedActivities.nonMid.flatMap(group => group.activities);
  }

  private updateDisplayedActivities(showMid: boolean) {
    // Update displayed activities based on selection (MID vs OSM)
    this.groupedActivities = showMid ? this.allGroupedActivities.mid : this.allGroupedActivities.nonMid;

    if (showMid) {
      // For MID activities, select all by default
      const allMidActivities = this.groupedActivities.flatMap(group => group.activities);
      this.projectForm.get('activities.selectedMidActivities')?.setValue(allMidActivities);
    } else {
      // For OSM activities, clear any previous selection
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

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkMobile();
  }

  private checkMobile(): void {
    this.isMobile = window.innerWidth < 768;
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
          // Initialize map when areas are loaded and we're on step 4
          if (this.activeIndex === 3) {
            setTimeout(() => {
              this.initializeMap();
              this.setupAreaSelection();
            }, 0);
          }
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
    } else if (this.activeIndex === 3) {
      // If areas are already loaded and we're on step 4, initialize map
      setTimeout(() => {
        this.initializeMap();
        this.setupAreaSelection();
      }, 0);
    }
  }

  private loadLands() {
    this.landsService.getLands().subscribe({
      next: (lands: Land[]) => {
        this.lands = lands.sort((a, b) => a.name.localeCompare(b.name));
      },
      error: (error) => {
        console.error('Fehler beim Laden der Länder:', error);
      }
    });
  }

  private loadRegioStars() {
    this.regiostarService.getRegioStars().subscribe({
      next: (regiostars: RegioStar[]) => {
        this.regiostars = regiostars.sort((a, b) => a.regiostar7 - b.regiostar7);
        // Select all regiostars by default
        this.selectedRegioStars = [...this.regiostars];
        this.projectForm.get('summary.regiostars')?.setValue(this.selectedRegioStars);
      },
      error: (error) => {
        console.error('Fehler beim Laden der RegioStars:', error);
      }
    });
  }

  // Area selection methods from area-selection component
  private initializeTooltip() {
    // Remove existing tooltip if it exists
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
    }

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'tooltip';
    this.tooltipElement.style.backgroundColor = 'white';
    this.tooltipElement.style.padding = '5px';
    this.tooltipElement.style.border = '1px solid #ccc';
    this.tooltipElement.style.borderRadius = '4px';
    this.tooltipElement.style.position = 'relative';
    this.tooltipElement.style.zIndex = '1000';

    this.overlay = new Overlay({
      element: this.tooltipElement,
      offset: [10, 0],
      positioning: 'bottom-left',
    });
  }

  private initializeMap() {
    // Clean up existing map if it exists
    if (this.map) {
      if (this.overlay) {
        this.map.removeOverlay(this.overlay);
      }
      this.map.dispose();
      this.map = undefined;
      this.vectorLayer = undefined;
    }

    const mapElement = document.getElementById('create-map');
    if (!mapElement) {
      console.error("Map container not found");
      return;
    }

    const baseLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        crossOrigin: 'anonymous'
      })
    });

    this.vectorLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const isSelected = this.selectedFeatures.has(feature.getId() as string);
        return new Style({
          zIndex: isSelected ? 1000 : 1,
          fill: new Fill({
            color: isSelected ? 'rgba(72, 38, 131, 0.5)' : 'rgba(255, 255, 255, 0.5)'
          }),
          stroke: new Stroke({
            color: '#482683',
            width: isSelected ? 2 : 1
          })
        });
      }
    });

    this.initializeTooltip();

    this.map = new Map({
      target: 'create-map',
      layers: [baseLayer, this.vectorLayer],
      view: new View({
        center: fromLonLat([10.4515, 51.1657]),
        zoom: 6
      })
    });

    if (this.overlay) {
      this.map.addOverlay(this.overlay);
    }

    this.map.on('click', (event) => {
      const feature = this.map?.forEachFeatureAtPixel(event.pixel, (feature) => feature);
      if (feature) {
        const featureId = feature.getId() as string;
        if (this.selectedFeatures.has(featureId)) {
          this.selectedFeatures.delete(featureId);
        } else {
          this.selectedFeatures.add(featureId);
        }
        this.vectorLayer?.changed();
        this.updateSelectedAreas();
      }
    });

    this.map.on('pointermove', (event) => {
      if (event.dragging || !this.tooltipElement || !this.overlay) {
        this.tooltipElement!.style.display = 'none';
        return;
      }

      const feature = this.map?.forEachFeatureAtPixel(event.pixel, (feature) => feature);

      if (feature) {
        const name = feature.get('name');
        if (name) {
          this.tooltipElement.style.display = '';
          this.tooltipElement.innerHTML = name;
          this.overlay.setPosition(event.coordinate);
        } else {
          this.tooltipElement.style.display = 'none';
        }
      } else {
        this.tooltipElement.style.display = 'none';
      }
    });
  }

  private setupAreaSelection() {
    if (!this.areasGeoJson || !this.vectorLayer) return;

    const features = this.geoJsonFormat.readFeatures(this.areasGeoJson, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326'
    });

    features.forEach(feature => {
      if (!feature.getId()) {
        feature.setId(feature.get('id'));
      }
    });

    const source = this.vectorLayer.getSource();
    source?.clear();
    source?.addFeatures(features);
  }

  private updateSelectedAreas() {
    this.selectedAreaIds = Array.from(this.selectedFeatures);
    this.projectForm.get('area.selectedArea')?.setValue(this.selectedAreaIds);

    // Check for completely selected lands
    const hasCompletelySelectedLands = this.lands.some(land => this.getLandSelectionState(land));
    const hasPartiallySelectedLands = this.lands.some(land => this.isLandIndeterminate(land));

    this.hasCompletelySelectedLands = hasCompletelySelectedLands && !hasPartiallySelectedLands;
  }

  getLandSelectionState(land: Land): boolean {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);

    if (landFeatures.length === 0) return false;

    const selectedCount = landFeatures.filter((f: any) =>
      this.selectedFeatures.has(f.getId() as string)
    ).length;

    return selectedCount === landFeatures.length;
  }

  isLandIndeterminate(land: Land): boolean {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);

    return landFeatures.length > 0 && landFeatures.some((f: any) =>
      this.selectedFeatures.has(f.getId() as string)
    ) && !this.isLandSelected(land);
  }

  isLandSelected(land: Land): boolean {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);

    return landFeatures.length > 0 && landFeatures.every((f: any) =>
      this.selectedFeatures.has(f.getId() as string)
    );
  }

  selectLand(land: Land) {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);

    landFeatures.forEach((f: any) => {
      if (land.checked) {
        this.selectedFeatures.add(f.getId() as string);
      } else {
        this.selectedFeatures.delete(f.getId() as string);
      }
    });

    this.vectorLayer?.changed();
    this.updateSelectedAreas();
  }

  toggleLandSelection(land: Land, event: Event) {
    // Toggle the checkbox state
    land.checked = !land.checked;
    // Call the selectLand method to update the map
    this.selectLand(land);
  }
} 
