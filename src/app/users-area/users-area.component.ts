import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../services/project.service';
import { DashboardSessionService } from '../services/dashboard-session.service';
import { AuthService } from '../auth/auth.service';
import { Project, projectGroupId } from '../interfaces/project';
import { CustomPersonaService } from '../services/custom-persona.service';
import { CustomPersona } from '../interfaces/custom-persona';

export interface ProjectListSection {
  id: number | null;
  displayName: string;
  projects: Project[];
}

@Component({
  selector: 'app-users-area',
  imports: [CommonModule, SharedModule, TranslateModule],
  templateUrl: './users-area.component.html',
  styleUrl: './users-area.component.css',
})
export class UsersAreaComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private customPersonaService = inject(CustomPersonaService);

  projects = signal<Project[]>([]);
  customPersonas = signal<CustomPersona[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  personaError = signal<string | null>(null);
  selectedProjectId = signal<number | null>(null);
  expandedSectionKeys = signal<Set<string>>(new Set());
  pendingDeletePersonaId = signal<number | null>(null);
  deletingPersonaId = signal<number | null>(null);

  pinnedProjects = computed(() =>
    this.sortProjects(this.projects().filter((project) => project.pin))
  );

  unpinnedProjects = computed(() =>
    this.projects().filter((project) => !project.pin)
  );

  sections = computed(() => this.buildSections(this.unpinnedProjects()));

  hasGroupedSections = computed(() =>
    this.sections().some((section) => section.id !== null)
  );

  flatProjects = computed(() => this.sortProjects(this.projects()));

  private personaByPublishedProjectId = computed(() => {
    const byProjectId = new Map<number, CustomPersona>();
    for (const persona of this.customPersonas()) {
      if (persona.published_project_id) {
        byProjectId.set(persona.published_project_id, persona);
      }
    }
    return byProjectId;
  });

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/landing']);
      return;
    }

    const currentProjectId = this.dashboardSessionService.getProjectId();
    if (currentProjectId) {
      this.selectedProjectId.set(Number(currentProjectId));
    }

    this.loadData();
  }

  private loadData(showSpinner = true): void {
    if (showSpinner) {
      this.loading.set(true);
    }
    this.error.set(null);
    this.personaError.set(null);

    forkJoin({
      projects: this.projectsService.getAllProjects(),
      personas: this.customPersonaService.getCustomPersonas().pipe(
        catchError((err: unknown) => {
          console.error('Error loading custom personas:', err);
          this.personaError.set('usersArea.loadPersonasError');
          return of({ results: [] as CustomPersona[], count: 0, next: null, previous: null });
        })
      ),
    }).subscribe({
      next: ({ projects, personas }) => {
        this.projectsService.setListedProjects(projects);
        this.projects.set(projects);
        this.initializeExpandedSections(projects);
        this.customPersonas.set(personas.results);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        console.error('Error loading projects:', err);
        this.error.set('usersArea.loadError');
        this.loading.set(false);
      },
    });
  }

  private sortProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  private buildSections(projects: Project[]): ProjectListSection[] {
    const byGroup = new Map<number, Project[]>();
    const ungrouped: Project[] = [];

    for (const project of projects) {
      const groupId = projectGroupId(project);
      if (groupId != null) {
        const groupProjects = byGroup.get(groupId) ?? [];
        groupProjects.push(project);
        byGroup.set(groupId, groupProjects);
      } else {
        ungrouped.push(project);
      }
    }

    const sections: ProjectListSection[] = [];

    for (const [groupId, groupProjects] of byGroup) {
      const sorted = this.sortProjects(groupProjects);
      if (sorted.length === 0) {
        continue;
      }

      const displayName =
        sorted.find((project) => project.group?.display_name)?.group?.display_name ??
        `Group ${groupId}`;

      sections.push({ id: groupId, displayName, projects: sorted });
    }

    sections.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const sortedUngrouped = this.sortProjects(ungrouped);
    if (sortedUngrouped.length > 0) {
      sections.push({
        id: null,
        displayName: '',
        projects: sortedUngrouped,
      });
    }

    return sections;
  }

  private initializeExpandedSections(projects: Project[]): void {
    const sections = this.buildSections(projects.filter((project) => !project.pin));
    const keys = new Set<string>();

    if (!sections.some((section) => section.id !== null)) {
      return;
    }

    const selectedId = this.selectedProjectId();

    for (const section of sections) {
      if (section.id === null) {
        keys.add(this.sectionKey(section));
        continue;
      }

      if (section.projects.some((project) => project.id === selectedId)) {
        keys.add(this.sectionKey(section));
      }
    }

    this.expandedSectionKeys.set(keys);
  }

  sectionKey(section: ProjectListSection): string {
    return section.id === null ? 'ungrouped' : `group-${section.id}`;
  }

  isSectionExpanded(section: ProjectListSection): boolean {
    return this.expandedSectionKeys().has(this.sectionKey(section));
  }

  toggleSection(section: ProjectListSection): void {
    const key = this.sectionKey(section);
    const next = new Set(this.expandedSectionKeys());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.expandedSectionKeys.set(next);
  }

  selectProject(project: Project): void {
    this.selectedProjectId.set(project.id);
    this.dashboardSessionService.setProjectId(project.id.toString());
    this.router.navigate(['/dashboard'], { queryParams: { project_id: project.id } });
  }

  isProjectSelected(projectId: number): boolean {
    return this.selectedProjectId() === projectId;
  }

  personaForProject(project: Project): CustomPersona | undefined {
    return this.personaByPublishedProjectId().get(project.id);
  }

  createPersona(): void {
    this.router.navigate(['/persona-editor']);
  }

  editPersona(persona: CustomPersona): void {
    this.router.navigate(['/persona-editor', persona.id]);
  }

  editPersonaFromProject(event: Event, persona: CustomPersona): void {
    event.stopPropagation();
    this.editPersona(persona);
  }

  openPersonaProject(event: Event, persona: CustomPersona): void {
    event.stopPropagation();
    if (!persona.published_project_id) {
      this.editPersona(persona);
      return;
    }
    this.dashboardSessionService.setProjectId(persona.published_project_id.toString());
    this.router.navigate(['/dashboard'], {
      queryParams: { project_id: persona.published_project_id },
    });
  }

  requestDeletePersona(event: Event, persona: CustomPersona): void {
    event.stopPropagation();
    this.pendingDeletePersonaId.set(persona.id);
  }

  cancelDeletePersona(event: Event): void {
    event.stopPropagation();
    this.pendingDeletePersonaId.set(null);
  }

  confirmDeletePersona(event: Event, persona: CustomPersona): void {
    event.stopPropagation();
    this.deletingPersonaId.set(persona.id);
    this.customPersonaService.deleteCustomPersona(persona.id).subscribe({
      next: () => {
        this.pendingDeletePersonaId.set(null);
        this.deletingPersonaId.set(null);
        this.customPersonas.set(
          this.customPersonas().filter((item) => item.id !== persona.id)
        );
        this.loadData(false);
      },
      error: (err: unknown) => {
        console.error('Error deleting custom persona:', err);
        this.deletingPersonaId.set(null);
        this.personaError.set('usersArea.deletePersonaError');
      },
    });
  }
}
