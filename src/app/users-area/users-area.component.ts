import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../services/project.service';
import { DashboardSessionService } from '../services/dashboard-session.service';
import { AuthService } from '../auth/auth.service';
import { Project } from '../interfaces/project';

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

  projects = signal<Project[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  selectedProjectId = signal<number | null>(null);
  expandedSectionKeys = signal<Set<string>>(new Set());

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

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/landing']);
      return;
    }

    const currentProjectId = this.dashboardSessionService.getProjectId();
    if (currentProjectId) {
      this.selectedProjectId.set(Number(currentProjectId));
    }

    this.loadProjects();
  }

  private loadProjects(): void {
    this.loading.set(true);
    this.error.set(null);

    this.projectsService.getProjects(1, 100).subscribe({
      next: (response) => {
        this.projects.set(response.results);
        this.initializeExpandedSections(response.results);
        this.loading.set(false);
      },
      error: (err) => {
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
      if (project.group_id != null) {
        const groupProjects = byGroup.get(project.group_id) ?? [];
        groupProjects.push(project);
        byGroup.set(project.group_id, groupProjects);
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
}
