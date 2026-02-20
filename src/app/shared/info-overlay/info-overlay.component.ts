import { Component, TemplateRef, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../shared.module';
import { InfoDialogComponent } from './info-dialog.component';

@Component({
  selector: 'app-info-overlay',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './info-overlay.component.html',
  styleUrl: './info-overlay.component.css'
})
export class InfoOverlayComponent {
  private dialog = inject(MatDialog);
  
  @ViewChild('contentTemplate') contentTemplate!: TemplateRef<any>;

  openDialog(): void {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
      panelClass: 'info-dialog-panel',
      data: { content: this.contentTemplate }
    });
  }
}
