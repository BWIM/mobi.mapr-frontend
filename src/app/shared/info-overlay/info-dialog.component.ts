import { Component, Inject, TemplateRef, Type } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared.module';

export interface InfoDialogData {
  content: TemplateRef<any> | Type<any>;
}

@Component({
  selector: 'app-info-dialog',
  standalone: true,
  imports: [SharedModule, CommonModule],
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.css'
})
export class InfoDialogComponent {
  isTemplateRef = false;
  isComponent = false;
  componentType: Type<any> | null = null;
  templateRef: TemplateRef<any> | null = null;

  constructor(
    public dialogRef: MatDialogRef<InfoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InfoDialogData
  ) {
    // Check if content is a TemplateRef or Component type
    if (data.content instanceof TemplateRef) {
      this.isTemplateRef = true;
      this.templateRef = data.content;
    } else if (typeof data.content === 'function') {
      this.isComponent = true;
      this.componentType = data.content as Type<any>;
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
