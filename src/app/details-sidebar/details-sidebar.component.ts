import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-details-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule,
  ],
  templateUrl: './details-sidebar.component.html',
  styleUrl: './details-sidebar.component.css'
})
export class DetailsSidebarComponent implements OnInit {

  constructor(private translate: TranslateService) {}

  ngOnInit() {}

} 