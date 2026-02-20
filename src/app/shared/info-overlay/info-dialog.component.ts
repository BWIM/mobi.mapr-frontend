import { Component, Inject, TemplateRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../shared.module';

export interface InfoDialogData {
  content: TemplateRef<any>;
}

@Component({
  selector: 'app-info-dialog',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.css'
})
export class InfoDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<InfoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InfoDialogData
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }
}
