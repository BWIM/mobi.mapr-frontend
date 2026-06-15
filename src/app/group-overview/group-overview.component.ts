import { Component, inject, output, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../services/project.service';
import { ProjectNavigationService } from '../services/project-navigation.service';
import { ProjectGroupSibling } from '../interfaces/project-group';
import { Project } from '../interfaces/project';

@Component({
  selector: 'app-group-overview',
  imports: [CommonModule, SharedModule, TranslateModule],
  templateUrl: './group-overview.component.html',
  styleUrl: './group-overview.component.css',
})
export class GroupOverviewComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  private projectNavigation = inject(ProjectNavigationService);

  projectSelected = output<number>();
  backRequested = output<void>();

  project = this.projectsService.project;
  loading = signal(false);
  error = signal<string | null>(null);
  fallbackProjects = signal<ProjectGroupSibling[]>([]);

  groupName = computed(() => this.project()?.group?.display_name ?? '');
  siblings = computed((): ProjectGroupSibling[] => {
    const fromGroup = this.project()?.group?.projects ?? [];
    if (fromGroup.length > 0) {
      return fromGroup;
    }
    return this.fallbackProjects();
  });

  activeProjectId = computed(() => this.project()?.id ?? null);

  ngOnInit(): void {
    const group = this.project()?.group;
    if (!group) {
      return;
    }

    if (group.projects.length === 0 && group.id) {
      this.loading.set(true);
      this.projectsService.getProjects(1, 100, group.id).subscribe({
        next: (response) => {
          this.fallbackProjects.set(
            response.results.map((p) => ({ id: p.id, display_name: p.display_name }))
          );
          this.loading.set(false);
        },
        error: () => {
          this.error.set('groupOverview.loadError');
          this.loading.set(false);
        },
      });
    }
  }

  selectProject(sibling: ProjectGroupSibling): void {
    this.projectNavigation.switchToProject(sibling.id, { closeOverview: true }).subscribe({
      next: () => this.projectSelected.emit(sibling.id),
    });
  }

  isActive(projectId: number): boolean {
    return this.activeProjectId() === projectId;
  }

  onBack(): void {
    this.backRequested.emit();
  }
}
