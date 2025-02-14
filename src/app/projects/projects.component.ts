import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { ProjectsService } from './projects.service';
import { Project, ProjectGroup } from './project.interface';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { SharedModule } from '../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { MapService } from '../map/map.service';

interface GroupedProjects {
  group: ProjectGroup;
  projects: Project[];
}

@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css'],
  providers: [MessageService],
  standalone: true,
  imports: [SharedModule]
})
export class ProjectsComponent implements OnInit {
  @Output() projectAction = new EventEmitter<void>();
  loading = false;
  projectGroups: ProjectGroup[] = [];
  groupedProjects: GroupedProjects[] = [];
  ungroupedProjects: Project[] = [];

  constructor(
    private projectsService: ProjectsService,
    private messageService: MessageService,
    private translate: TranslateService,
    private mapService: MapService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    
    this.projectsService.getProjectGroups()
      .pipe(finalize(() => this.loading = false))
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
    this.loading = true;
    
    this.projectsService.getProjects()
      .pipe(finalize(() => this.loading = false))
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

  showResults(project: Project): void {
    this.loading = true;
    
    this.projectsService.getProjectResults(project.id)
      .pipe(finalize(() => this.loading = false))
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
}
