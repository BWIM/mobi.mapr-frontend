import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../services/project.service';
import type { ProjectDataInfoDialogData } from './project-data-info-dialog.component';

@Component({
  selector: 'app-project-info',
  imports: [SharedModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-info.component.html',
})
export class ProjectInfoComponent {
  private projectsService = inject(ProjectsService);
  private dialog = inject(MatDialog);
  private project = this.projectsService.project;

  readonly blogUrl = computed(() => this.project()?.blog_url?.trim() || null);
  readonly licenseInfo = computed(() => this.project()?.license_info?.trim() || null);

  async openDataInfo(): Promise<void> {
    const { ProjectDataInfoDialogComponent } = await import('./project-data-info-dialog.component');
    this.dialog.open<InstanceType<typeof ProjectDataInfoDialogComponent>, ProjectDataInfoDialogData>(
      ProjectDataInfoDialogComponent,
      { data: { licenseInfo: this.licenseInfo() } }
    );
  }
}
