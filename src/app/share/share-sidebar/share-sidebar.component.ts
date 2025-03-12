import { Component, Input } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { ShareProject } from '../share.interface';

@Component({
  selector: 'app-share-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule
  ],
  templateUrl: './share-sidebar.component.html',
  styleUrl: './share-sidebar.component.css'
})
export class ShareSidebarComponent {
  @Input() sharedProject: ShareProject | null = null;

  constructor(private translate: TranslateService) {}
}
