import { Component, inject, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../services/project.service';
import { ProjectNavigationService } from '../services/project-navigation.service';
import { ProjectGroupMember } from '../interfaces/project-group';

@Component({
  selector: 'app-group-overview',
  imports: [CommonModule, SharedModule, TranslateModule],
  templateUrl: './group-overview.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './group-overview.component.css',
})
export class GroupOverviewComponent {
  private projectsService = inject(ProjectsService);
  private projectNavigation = inject(ProjectNavigationService);

  projectSelected = output<number>();
  backRequested = output<void>();

  project = this.projectsService.project;
  sections = this.projectNavigation.groupSections;
  activeProjectId = this.projectNavigation.activeProjectId;

  /** With one group the title names it; with several, each section has its own heading. */
  singleGroupName = computed(() => {
    const sections = this.sections();
    return sections.length === 1 ? sections[0].display_name : null;
  });

  selectProject(member: ProjectGroupMember): void {
    this.projectNavigation.switchToProject(member.id, { closeOverview: true }).subscribe({
      next: () => this.projectSelected.emit(member.id),
    });
  }

  isActive(projectId: number): boolean {
    return this.activeProjectId() === projectId;
  }

  onBack(): void {
    this.backRequested.emit();
  }
}
