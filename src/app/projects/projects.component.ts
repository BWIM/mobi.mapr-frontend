import { Component, OnInit, Output, EventEmitter, ViewChild, OnDestroy } from '@angular/core';
import { ProjectsService } from './projects.service';
import { Project, ProjectGroup } from './project.interface';
import { MessageService, ConfirmationService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { SharedModule } from '../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { MapService } from '../map/map.service';
import { MenuItem } from 'primeng/api';
import { Router } from '@angular/router';
import { ProjectWizardService } from './project-wizard/project-wizard.service';
import { environment } from '../../environments/environment';
import { WebSocketSubject } from 'rxjs/webSocket';
import { WebsocketService } from '../services/websocket.service';
import { ProjectsReloadService } from './projects-reload.service';
import { LoadingService } from '../services/loading.service';
import { AnalyzeService } from '../analyze/analyze.service';

interface GroupedProjects {
  group: ProjectGroup;
  projects: Project[];
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
  feature: any;
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
  
  projectGroups: ProjectGroup[] = [];
  groupedProjects: GroupedProjects[] = [];
  ungroupedProjects: Project[] = [];
  items: MenuItem[] = [];
  selectedProject?: Project;
  selectedTableProject?: Project;
  private websocketConnections: Map<number, WebSocketSubject<WebsocketResult>> = new Map();
  editDialogVisible = false;
  projectToEdit: Project | null = null;
  
  // Neue Properties für Projektgruppen
  projectGroupDialogVisible = false;
  projectGroupToEdit: ProjectGroup | null = null;
  newProjectGroup: ProjectGroup = { name: '', id: '', user: '', default: false };

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
    private mapService: MapService,
    private analyzeService: AnalyzeService,
    private router: Router,
    private wizardService: ProjectWizardService,
    private websocketService: WebsocketService,
    private reloadService: ProjectsReloadService,
    private loadingService: LoadingService,
    private confirmationService: ConfirmationService
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
          this.showResults(this.selectedProject, 'hexagons');
        },
      },
      {
        icon: 'pi pi-map',
        label: this.translate.instant('MAP.ACTIONS.GEMEINDE'),
        command: () => {
          this.showResults(this.selectedProject, 'municipalities');
        },
      },
      {
        icon: 'pi pi-home',
        label: this.translate.instant('MAP.ACTIONS.LANDKREIS'),
        command: () => {
          this.showResults(this.selectedProject, 'landkreise');
        },
        disabled: this.selectedProject?.type === 'Hexagon' || this.selectedProject?.type === "Gemeinde"
      },
      {
        icon: 'pi pi-globe',
        label: this.translate.instant('MAP.ACTIONS.LAND'),
        command: () => {
          this.showResults(this.selectedProject, 'laender');
        },
        disabled: this.selectedProject?.type !== "Land"
      }
    ];
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loadingService.startLoading();
    this.menuItemsCache.clear();
    
    this.projectsService.getProjectGroups()
      .pipe(finalize(() => this.loadingService.stopLoading()))
      .subscribe({
        next: (response) => {
          this.projectGroups = response.results;
          this.loadProjects();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
            detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
          });
        }
      });
  }

  private loadProjects(): void {
    this.loadingService.startLoading();
    
    this.projectsService.getProjects()
      .pipe(finalize(() => this.loadingService.stopLoading()))
      .subscribe({
        next: (response) => {
          const projects = response.results;
          
          // Projekte nach Gruppen sortieren
          this.groupedProjects = this.projectGroups.map(group => ({
            group,
            projects: projects.filter(p => p.projectgroup?.id === group.id)
          })).filter(g => g.projects.length > 0);

          // Nicht gruppierte Projekte sammeln
          this.ungroupedProjects = projects.filter(p => !p.projectgroup);

          // Websockets für unvollständige Projekte einrichten
          this.setupWebsocketsForAllProjects();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
            detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
          });
        }
      });
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
            detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
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
    return Math.round((project.calculated / project.areas) * 100);
  }

  showResults(project: Project | undefined, maptype: string): void {
    if (!project) return;
    this.selectedTableProject = project;
    this.loadingService.startLoading();
    this.analyzeService.setCurrentProject(project.id.toString());
    this.analyzeService.setMapType(maptype);
    
    // Lade Projektinformationen
    this.projectsService.getProjectInfo(project.id).subscribe({
      next: (info) => {
        this.projectsService.updateCurrentProjectInfo(info);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Projektinformationen:', error);
      }
    });

    this.projectsService.getProjectResults(project.id, maptype)
      .pipe(finalize(() => this.loadingService.stopLoading()))
      .subscribe({
        next: (results) => {
          this.mapService.resetMap();
          this.mapService.updateFeatures(results.geojson.features);
          this.projectAction.emit();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
            detail: this.translate.instant('PROJECTS.RESULTS.LOAD_ERROR')
          });
        }
      });
  }

  showProjectWizard(): void {
    this.loadingService.startLoading();
    this.projectsService.checkAllFinished().pipe(
      finalize(() => this.loadingService.stopLoading())
    ).subscribe({
      next: (status) => {
        if (!status.all_finished) {
          const unfinishedProjectNames = status.unfinished_projects
            .map(p => p.display_name)
            .join(', ');
          
          this.messageService.add({
            severity: 'warn',
            summary: this.translate.instant('PROJECTS.MESSAGES.UNFINISHED_PROJECTS'),
            detail: this.translate.instant('PROJECTS.MESSAGES.UNFINISHED_PROJECTS_DETAIL', { projects: unfinishedProjectNames }),
            life: 5000
          });
        } else {
          this.wizardService.show();
        }
      },
      error: (error) => {
        console.error('Fehler beim Prüfen der Projekte:', error);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
          detail: this.translate.instant('PROJECTS.MESSAGES.CHECK_PROJECTS_ERROR')
        });
      }
    });
  }

  private setupWebsocketForProject(project: Project): void {
    if (project.finished) return;
    
    if (this.websocketConnections.has(project.id)) return;
    
    const wsSubject = this.websocketService.connect<WebsocketResult>(
      `${environment.wsURL}/projects/?project=${project.id}`
    );

    this.websocketConnections.set(project.id, wsSubject);

    wsSubject.subscribe({
      next: (result: WebsocketResult) => {
        console.log(result);
        if (result.result.feature) {
          this.mapService.updateFeatures([result.result.feature]);
        }
        
        const projectToUpdate = this.findProjectById(result.result.project);
        if (projectToUpdate) {
          projectToUpdate.calculated = result.result.calculated;
          projectToUpdate.areas = result.result.total;
          projectToUpdate.finished = result.result.finished;
        }

        if (result.result.finished) {
          this.closeWebsocketConnection(result.result.project);
        }
      },
      error: (error) => {
        console.error(`WebSocket Fehler für Projekt ${project.id}:`, error);
        this.closeWebsocketConnection(project.id);
      }
    });
  }

  private findProjectById(projectId: number): Project | undefined {
    for (const group of this.groupedProjects) {
      const project = group.projects.find(p => p.id === projectId);
      if (project) return project;
    }
    return this.ungroupedProjects.find(p => p.id === projectId);
  }

  private closeWebsocketConnection(projectId: number): void {
    const connection = this.websocketConnections.get(projectId);
    if (connection) {
      connection.complete();
      this.websocketConnections.delete(projectId);
    }
  }

  private setupWebsocketsForAllProjects(): void {
    [...this.groupedProjects.flatMap(g => g.projects), ...this.ungroupedProjects]
      .forEach(project => this.setupWebsocketForProject(project));
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
}
