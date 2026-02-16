import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { CreditsDialogComponent } from './credits-dialog/credits-dialog.component';

@Component({
  selector: 'app-bottom',
  imports: [CommonModule],
  templateUrl: './bottom.component.html',
  styleUrl: './bottom.component.css',
})
export class BottomComponent {
  currentYear = new Date().getFullYear();

  constructor(private dialog: MatDialog) {}

  openCredits() {
    this.dialog.open(CreditsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }
}
