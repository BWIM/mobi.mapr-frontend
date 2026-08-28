import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../shared.module';

export interface ProjectDataInfoDialogData {
  licenseInfo: string | null;
}

@Component({
  selector: 'app-project-data-info-dialog',
  imports: [SharedModule],
  templateUrl: './project-data-info-dialog.component.html',
})
export class ProjectDataInfoDialogComponent {
  private dialogRef = inject(MatDialogRef<ProjectDataInfoDialogComponent>);
  readonly data = inject<ProjectDataInfoDialogData>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
