import { Component, TemplateRef, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../shared.module';
import { openInfoDialog } from './open-info-dialog';

@Component({
  selector: 'app-info-overlay',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './info-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './info-overlay.component.css'
})
export class InfoOverlayComponent {
  private dialog = inject(MatDialog);
  
  @ViewChild('contentTemplate') contentTemplate!: TemplateRef<any>;

  openDialog(): void {
    void openInfoDialog(this.dialog, this.contentTemplate);
  }
}
