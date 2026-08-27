import { Component, inject, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../services/project.service';
import { ProjectNavigationService } from '../services/project-navigation.service';
import { ProjectGroupSibling } from '../interfaces/project-group';

@Component({
  selector: 'app-group-overview',
  imports: [CommonModule, SharedModule, TranslateModule],
  templateUrl: './group-overview.component.html',
  styleUrl: './group-overview.component.css',
})
export class GroupOverviewComponent {
  private projectsService = inject(ProjectsService);
  private projectNavigation = inject(ProjectNavigationService);

  projectSelected = output<number>();
  backRequested = output<void>();

  project = this.projectsService.project;
  loading = this.projectNavigation.siblingsLoading;
  error = this.projectNavigation.siblingsError;
  siblings = this.projectNavigation.siblingProjects;
  activeProjectId = this.projectNavigation.activeProjectId;

  groupName = computed(() => this.project()?.group?.display_name ?? '');

  selectProject(sibling: ProjectGroupSibling): void {
    this.projectNavigation.switchToProject(sibling.id, {
      closeOverview: true,
      siblingShareKey: sibling.share_key ?? null,
    }).subscribe({
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
