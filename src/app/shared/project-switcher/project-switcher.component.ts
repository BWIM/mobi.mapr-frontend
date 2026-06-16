import { Component, inject, computed } from '@angular/core';
import { SharedModule } from '../shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../services/project.service';
import { ProjectNavigationService } from '../../services/project-navigation.service';

@Component({
  selector: 'app-project-switcher',
  imports: [SharedModule, TranslateModule],
  templateUrl: './project-switcher.component.html',
})
export class ProjectSwitcherComponent {
  private projectsService = inject(ProjectsService);
  private projectNavigation = inject(ProjectNavigationService);

  project = this.projectsService.project;
  siblings = this.projectNavigation.siblingProjects;
  activeProjectId = this.projectNavigation.activeProjectId;

  groupName = computed(() => this.project()?.group?.display_name ?? '');

  hasGroup = computed(() => !!this.project()?.group);

  switchTo(projectId: number): void {
    const sibling = this.siblings().find((entry) => entry.id === projectId);
    const siblingShareKey = sibling?.share_key ?? null;

    if (projectId === this.activeProjectId() && !siblingShareKey) {
      return;
    }
    this.projectNavigation.switchToProject(projectId, { siblingShareKey }).subscribe();
  }
}
