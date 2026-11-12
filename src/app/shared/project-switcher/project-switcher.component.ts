import { Component, inject, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { SharedModule } from '../shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../services/project.service';
import { ProjectNavigationService } from '../../services/project-navigation.service';

@Component({
  selector: 'app-project-switcher',
  imports: [SharedModule, TranslateModule],
  templateUrl: './project-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './project-switcher.component.css',
})
export class ProjectSwitcherComponent {
  private projectsService = inject(ProjectsService);
  private projectNavigation = inject(ProjectNavigationService);

  /** `mobile` shows a static project title plus a separate switch button for the filter panel. */
  variant = input<'default' | 'mobile'>('default');

  project = this.projectsService.project;
  sections = this.projectNavigation.groupSections;
  activeProjectId = this.projectNavigation.activeProjectId;
  hasGroup = this.projectNavigation.hasGroup;

  /** Group headings are only shown when the project is in more than one group. */
  showGroupHeadings = computed(() => this.sections().length > 1);

  switchTo(projectId: number): void {
    if (projectId === this.activeProjectId()) {
      return;
    }
    this.projectNavigation.switchToProject(projectId).subscribe();
  }
}
