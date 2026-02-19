import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';

@Component({
  selector: 'app-preparing-project-dialog',
  standalone: true,
  imports: [
    SharedModule,
  ],
  templateUrl: './preparing-project-dialog.component.html',
  styleUrl: './preparing-project-dialog.component.css'
})
export class PreparingProjectDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<PreparingProjectDialogComponent>
  ) {}
}