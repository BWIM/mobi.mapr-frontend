import { Component, OnInit, Output, EventEmitter, ViewChild, OnDestroy } from '@angular/core';
import { ProjectsService } from './projects.service';
import { Project, ProjectGroup } from './project.interface';
import { MessageService, ConfirmationService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { SharedModule } from '../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Router } from '@angular/router';
import { ProjectWizardService } from './project-wizard/project-wizard.service';
import { environment } from '../../environments/environment';
import { WebSocketSubject } from 'rxjs/webSocket';
import { WebsocketService } from '../services/websocket.service';
import { ProjectsReloadService } from './projects-reload.service';
import { LoadingService } from '../services/loading.service';
import { AnalyzeService } from '../analyze/analyze.service';
import { forkJoin } from 'rxjs';
import { MapV2Service } from '../map-v2/map-v2.service';

interface ProjectTab {
  label: string;
  icon: string;
  projects: Project[];
  groupedProjects: { [groupId: string]: Project[] };
  ungroupedProjects: Project[];
  loading: boolean;
}

interface WebsocketResult {
  type: string;
  result: ProjectProgress;
}

interface ProjectProgress {
  project: number;
  progress: number;
  calculated: number;
  finished: boolean;
  total: number;
  geojson: any;
}

@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css'],
  providers: [MessageService, ConfirmationService],
  standalone: true,
  imports: [SharedModule]
})
export class ProjectsComponent implements OnInit, OnDestroy {
  @Output() projectAction = new EventEmitter<void>();
  @Output() projectSelected = new EventEmitter<boolean>();
  @ViewChild('unusedGroupsOverlay') unusedGroupsOverlay!: any;

  projectGroups: ProjectGroup[] = [];
  items: MenuItem[] = [];
  selectedProject?: Project;
  selectedTableProject?: Project;
  autoCloseSidebar: boolean = false;
  private websocketConnections: Map<number, WebSocketSubject<WebsocketResult>> = new Map();
  editDialogVisible = false;
  projectToEdit: Project | null = null;
  progress: number = 0;
  loading: boolean = false;
  // Project group management
  projectGroupDialogVisible = false;
  projectGroupToEdit: ProjectGroup | null = null;
  newProjectGroup: ProjectGroup = { name: '', id: '', user: '', default: false };
  unusedGroups: ProjectGroup[] = [];
  selectedUnusedGroups: ProjectGroup[] = [];

  // Tabbed interface properties
  activeTabIndex: number = 0;
  projectTabs: ProjectTab[] = [
    {
      label: 'PROJECTS.TABS.PERSONAL',
      icon: 'pi pi-user',
      projects: [],
      groupedProjects: {},
      ungroupedProjects: [],
      loading: false
    },
    {
      label: 'PROJECTS.TABS.SHARED',
      icon: 'pi pi-users',
      projects: [],
      groupedProjects: {},
      ungroupedProjects: [],
      loading: false
    },
    {
      label: 'PROJECTS.TABS.PUBLIC',
      icon: 'pi pi-globe',
      projects: [],
      groupedProjects: {},
      ungroupedProjects: [],
      loading: false
    }
  ];

  // Collapse/expand state for project groups
  collapsedGroups: Set<string> = new Set();

  private menuItemsCache: Map<number, MenuItem[]> = new Map();

  get groupName(): string {
    return this.projectGroupToEdit ? this.projectGroupToEdit.name : this.newProjectGroup.name;
  }

  set groupName(value: string) {
    if (this.projectGroupToEdit) {
      this.projectGroupToEdit.name = value;
    } else {
      this.newProjectGroup.name = value;
    }
  }

  constructor(
    private projectsService: ProjectsService,
    private messageService: MessageService,
    private translate: TranslateService,
    private analyzeService: AnalyzeService,
    private router: Router,
    private wizardService: ProjectWizardService,
    private websocketService: WebsocketService,
    private reloadService: ProjectsReloadService,
    private loadingService: LoadingService,
    private confirmationService: ConfirmationService,
    private mapv2Service: MapV2Service
  ) {
    this.initializeMapActions();

    // Übersetzungen neu laden, wenn sich die Sprache ändert
    this.translate.onLangChange.subscribe(() => {
      this.initializeMapActions();
    });

    // Auf Reload-Events reagieren
    this.reloadService.reload$.subscribe(() => {
      this.loadData();
    });
  }

  private initializeMapActions(): void {
    this.items = [
      {
        icon: 'pi pi-th-large',
        label: this.translate.instant('MAP.ACTIONS.HEXAGON'),
        command: () => {
          this.showResults(this.selectedProject);
        },
        disabled: this.selectedProject?.build_hexagons
      },
      {
        icon: 'pi pi-map',
        label: this.translate.instant('MAP.ACTIONS.GEMEINDE'),
        command: () => {
          this.showResults(this.selectedProject);
        },
      },
      {
        icon: 'pi pi-home',
        label: this.translate.instant('MAP.ACTIONS.LANDKREIS'),
        command: () => {
          this.showResults(this.selectedProject);
        },
      },
      {
        icon: 'pi pi-globe',
        label: this.translate.instant('MAP.ACTIONS.LAND'),
        command: () => {
          this.showResults(this.selectedProject);
        },
        disabled: this.selectedProject?.type !== "Land"
      }
    ];
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.loadingService.startLoading();
    this.menuItemsCache.clear();

    this.projectsService.getProjectGroups()
      .pipe(finalize(() => this.loadingService.stopLoading()))
      .subscribe({
        next: (response) => {
          this.projectGroups = response.results;
          this.initializeGroupStates(); // Initialize all groups as collapsed
          this.updateUnusedGroups();
          this.loadAllTabProjects();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
            detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
          });
          this.loading = false;
        }
      });
  }

  private loadAllTabProjects(): void {
    // Load projects for all tabs in parallel
    const personalProjects$ = this.projectsService.getPersonalProjects();
    const sharedProjects$ = this.projectsService.getSharedProjects();
    const publicProjects$ = this.projectsService.getPublicProjects();

    // Set loading state for all tabs
    this.projectTabs.forEach(tab => tab.loading = true);

    forkJoin({
      personal: personalProjects$,
      shared: sharedProjects$,
      public: publicProjects$
    }).subscribe({
      next: (responses) => {
        // Process personal projects
        this.processTabProjects(responses.personal.results, 0);

        // Process shared projects
        this.processTabProjects(responses.shared.results, 1);

        // Process public projects
        this.processTabProjects(responses.public.results, 2);

        // Setup websockets for all projects
        this.setupWebsocketsForAllTabProjects();

        this.loading = false;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
          detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
        });
        this.projectTabs.forEach(tab => tab.loading = false);
        this.loading = false;
      }
    });
  }

  private processTabProjects(projects: Project[], tabIndex: number): void {
    const tab = this.projectTabs[tabIndex];
    tab.projects = projects;

    // Group projects
    tab.groupedProjects = {};
    tab.ungroupedProjects = [];

    projects.forEach(project => {
      if (project.projectgroup) {
        const groupId = project.projectgroup.id;
        if (!tab.groupedProjects[groupId]) {
          tab.groupedProjects[groupId] = [];
        }
        tab.groupedProjects[groupId].push(project);
      } else {
        tab.ungroupedProjects.push(project);
      }
    });

    tab.loading = false;
  }


  confirmDelete(project: Project): void {
    this.confirmationService.confirm({
      message: this.translate.instant('PROJECTS.MESSAGES.CONFIRM_DELETE'),
      header: this.translate.instant('COMMON.MESSAGES.CONFIRM_DELETE'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteProject(project);
      }
    });
  }

  deleteProject(project: Project): void {
    this.projectsService.deleteProject(project.id)
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.DELETE'),
            detail: this.translate.instant('PROJECTS.LIST.DELETED')
          });
          this.loadData();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.DELETE'),
            detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
          });
        }
      });
  }

  getProgress(project: Project): number {
    if (project.areas === 0) return 0;
    if (project.status === 'queued') return 0;
    this.progress = Math.floor((project.calculated / project.areas) * 100);
    return this.progress;
  }

  showResults(project: Project | undefined): void {
    try {
      if (!project) return;
      this.loadingService.startLoading();
      this.analyzeService.setCurrentProject(project.id.toString());

      // Projektinformationen laden
      this.projectsService.getProjectInfo(project.id).subscribe({
        next: (info) => {
          this.projectsService.updateCurrentProjectInfo(info);
          this.projectSelected.emit(this.autoCloseSidebar); // Emit den Auto-Close-Status
        },
        error: (error) => {
          console.error('Fehler beim Laden der Projektinformationen:', error);
        }
      });

      this.mapv2Service.setProjectVersion(project.version);

      // Set the full project data for copyright and creation date display
      this.mapv2Service.setProjectData(project);

      this.mapv2Service.setProject(project.id.toString(), undefined, project.display_name);
      this.loadingService.stopLoading();
    }
    catch (error) {
      console.error(error);
      this.loadingService.stopLoading(); // Stop loading on error
    }
  }

  showProjectWizard(): void {
    this.wizardService.show();
  }

  private setupWebsocketForProject(project: Project): void {
    if (project.status === 'finished') return;

    if (this.websocketConnections.has(project.id)) return;

    const wsSubject = this.websocketService.connect<WebsocketResult>(
      `${environment.wsURL}/projects/?project=${project.id}`
    );

    this.websocketConnections.set(project.id, wsSubject);

    wsSubject.subscribe({
      next: (result: WebsocketResult) => {
        if (!result.result) return;
        if (result.result && result.result.geojson) {
          this.mapv2Service.addSingleFeature(result.result.geojson);
        }

        const projectToUpdate = this.findProjectById(result.result.project);
        if (!projectToUpdate) return;
        if (projectToUpdate) {
          projectToUpdate.calculated = result.result.calculated;
          projectToUpdate.areas = result.result.total;
          projectToUpdate.status = result.result.finished ? "finished" : "calculating";
        }

        if (result.result.finished) {
          if (!result.result.project) return;
          const finishedProjectId = result.result.project;
          this.closeWebsocketConnection(finishedProjectId);
          // this.mapv2Service.emptyMap();
          setTimeout(() => {
            this.loadData();
            // Nach dem Laden der Daten das Projekt anzeigen
            setTimeout(() => {
              const project = this.findProjectById(finishedProjectId);
              if (project) {
                this.showResults(project);
              }
            }, 500);
          }, 500);
        }
      },
      error: (error) => {
        console.error(`WebSocket Fehler für Projekt ${project.id}:`, error);
        this.closeWebsocketConnection(project.id);
      }
    });
  }

  private findProjectById(projectId: number): Project | undefined {
    // Search in tab projects
    for (const tab of this.projectTabs) {
      const project = tab.projects.find(p => p.id === projectId);
      if (project) return project;
    }

    return undefined;
  }

  private closeWebsocketConnection(projectId: number): void {
    const connection = this.websocketConnections.get(projectId);
    if (connection) {
      connection.complete();
      this.websocketConnections.delete(projectId);
    }
  }


  private setupWebsocketsForAllTabProjects(): void {
    this.projectTabs.forEach(tab => {
      tab.projects.forEach(project => this.setupWebsocketForProject(project));
    });
  }

  ngOnDestroy(): void {
    // Alle Websocket-Verbindungen schließen
    this.websocketConnections.forEach((connection) => {
      connection.complete();
    });
    this.websocketConnections.clear();
  }

  openEditDialog(project: Project): void {
    this.projectToEdit = { ...project };
    this.editDialogVisible = true;
  }

  closeEditDialog(): void {
    this.editDialogVisible = false;
    this.projectToEdit = null;
  }

  saveProject(): void {
    if (!this.projectToEdit) return;

    this.loadingService.startLoading();

    this.projectsService.updateProject(this.projectToEdit.id, {
      display_name: this.projectToEdit.display_name,
      description: this.projectToEdit.description,
      projectgroup_id: this.projectToEdit.projectgroup?.id ? parseInt(this.projectToEdit.projectgroup?.id) : null
    }).pipe(
      finalize(() => {
        this.loadingService.stopLoading();
        this.closeEditDialog();
      })
    ).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.UPDATE'),
          detail: this.translate.instant('PROJECTS.MESSAGES.UPDATE_SUCCESS')
        });
        this.loadData();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('COMMON.MESSAGES.ERROR.UPDATE'),
          detail: this.translate.instant('PROJECTS.MESSAGES.UPDATE_ERROR')
        });
      }
    });
  }

  getSpeedDialItems(project: Project): MenuItem[] {
    if (!this.menuItemsCache.has(project.id)) {
      const items = [
        {
          icon: 'pi pi-pencil',
          label: this.translate.instant('COMMON.ACTIONS.EDIT'),
          command: () => this.openEditDialog(project),
          tooltipOptions: {
            tooltipLabel: this.translate.instant('COMMON.ACTIONS.EDIT')
          }
        },
        {
          icon: 'pi pi-trash',
          label: this.translate.instant('COMMON.ACTIONS.DELETE'),
          command: () => this.confirmDelete(project),
          tooltipOptions: {
            tooltipLabel: this.translate.instant('COMMON.ACTIONS.DELETE')
          }
        }
      ];
      this.menuItemsCache.set(project.id, items);
    }
    return this.menuItemsCache.get(project.id)!;
  }

  shareMap(project: Project): void {
    console.log(project);
  }

  downloadMap(project: Project): void {
    console.log(project);
  }

  showProjectGroupDialog(): void {
    this.newProjectGroup = { name: '', id: '', user: '', default: false };
    this.projectGroupDialogVisible = true;
  }

  editProjectGroup(group: ProjectGroup): void {
    this.projectGroupToEdit = { ...group };
    this.projectGroupDialogVisible = true;
  }

  saveProjectGroup(): void {
    if (this.projectGroupToEdit) {
      // Update existierende Gruppe
      this.loadingService.startLoading();
      this.projectsService.updateProjectGroup(this.projectGroupToEdit.id, this.projectGroupToEdit)
        .pipe(finalize(() => {
          this.loadingService.stopLoading();
          this.closeProjectGroupDialog();
        }))
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.UPDATE'),
              detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.UPDATE_SUCCESS')
            });
            this.loadData();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('COMMON.MESSAGES.ERROR.UPDATE'),
              detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.UPDATE_ERROR')
            });
          }
        });
    } else {
      // Neue Gruppe erstellen
      this.loadingService.startLoading();
      this.projectsService.createProjectGroup(this.newProjectGroup)
        .pipe(finalize(() => {
          this.loadingService.stopLoading();
          this.closeProjectGroupDialog();
        }))
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.CREATE'),
              detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.CREATE_SUCCESS')
            });
            this.loadData();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('COMMON.MESSAGES.ERROR.CREATE'),
              detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.CREATE_ERROR')
            });
          }
        });
    }
  }

  closeProjectGroupDialog(): void {
    this.projectGroupDialogVisible = false;
    this.projectGroupToEdit = null;
    this.newProjectGroup = { name: '', id: '', user: '', default: false };
  }

  confirmDeleteGroup(group: ProjectGroup): void {
    this.confirmationService.confirm({
      message: this.translate.instant('PROJECT_GROUPS.MESSAGES.CONFIRM_DELETE', { name: group.name }),
      header: this.translate.instant('COMMON.MESSAGES.CONFIRM_DELETE'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteProjectGroup(group);
      }
    });
  }

  deleteProjectGroup(group: ProjectGroup): void {
    this.loadingService.startLoading();

    this.projectsService.deleteProjectGroup(group.id)
      .pipe(finalize(() => this.loadingService.stopLoading()))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.DELETE'),
            detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.DELETE_SUCCESS')
          });
          this.closeProjectGroupDialog();
          this.loadData();
        },
        error: (error) => {
          console.error('Fehler beim Löschen der Projektgruppe:', error);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.DELETE'),
            detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.DELETE_ERROR')
          });
        }
      });
  }

  getCurrentTab(): ProjectTab {
    return this.projectTabs[this.activeTabIndex];
  }

  getProjectGroupsForTab(tabIndex: number): ProjectGroup[] {
    // Only return groups that have projects in this tab
    const tab = this.projectTabs[tabIndex];
    return this.projectGroups.filter(group => {
      const projectsInGroup = tab.groupedProjects[group.id] || [];
      return projectsInGroup.length > 0;
    });
  }

  getGroupedProjectsForTab(tabIndex: number): { [groupId: string]: Project[] } {
    return this.projectTabs[tabIndex].groupedProjects;
  }

  getUngroupedProjectsForTab(tabIndex: number): Project[] {
    return this.projectTabs[tabIndex].ungroupedProjects;
  }

  onTabChange(event: any): void {
    this.activeTabIndex = event.value;
  }

  private updateUnusedGroups(): void {
    // Find all groups that are not assigned to any project
    const usedGroupIds = new Set();

    // Check tab projects
    this.projectTabs.forEach(tab => {
      tab.projects
        .filter(p => p.projectgroup)
        .forEach(p => usedGroupIds.add(p.projectgroup!.id));
    });

    this.unusedGroups = this.projectGroups.filter(
      group => !usedGroupIds.has(group.id)
    );
  }

  showUnusedGroupsOverlay(event: any): void {
    this.updateUnusedGroups();
    this.unusedGroupsOverlay.toggle(event);
  }

  confirmDeleteUnusedGroups(): void {
    if (!this.selectedUnusedGroups?.length) return;

    const groupNames = this.selectedUnusedGroups.map(g => g.name).join(', ');

    this.confirmationService.confirm({
      message: this.translate.instant('PROJECT_GROUPS.MESSAGES.CONFIRM_DELETE_MULTIPLE', { groups: groupNames }),
      header: this.translate.instant('COMMON.MESSAGES.CONFIRM_DELETE'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.deleteUnusedGroups();
      }
    });
  }

  private deleteUnusedGroups(): void {
    if (!this.selectedUnusedGroups?.length) return;

    this.loadingService.startLoading();

    // Erstelle ein Array von Observables für jede Löschoperation
    const deleteObservables = this.selectedUnusedGroups.map(group =>
      this.projectsService.deleteProjectGroup(group.id)
    );

    // Führe alle Löschoperationen parallel aus
    forkJoin(deleteObservables)
      .pipe(finalize(() => {
        this.loadingService.stopLoading();
        this.unusedGroupsOverlay.hide();
      }))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('COMMON.MESSAGES.SUCCESS.DELETE'),
            detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.DELETE_MULTIPLE_SUCCESS')
          });
          this.selectedUnusedGroups = [];
          this.loadData();
        },
        error: (error) => {
          console.error('Fehler beim Löschen der Projektgruppen:', error);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.DELETE'),
            detail: this.translate.instant('PROJECT_GROUPS.MESSAGES.DELETE_MULTIPLE_ERROR')
          });
        }
      });
  }

  // Group collapse/expand methods
  isGroupCollapsed(groupId: string): boolean {
    return this.collapsedGroups.has(groupId);
  }

  toggleGroupCollapse(groupId: string): void {
    if (this.collapsedGroups.has(groupId)) {
      this.collapsedGroups.delete(groupId);
    } else {
      this.collapsedGroups.add(groupId);
    }
  }

  // Initialize all groups as collapsed by default
  private initializeGroupStates(): void {
    this.projectGroups.forEach(group => {
      this.collapsedGroups.add(group.id);
    });
  }
}
