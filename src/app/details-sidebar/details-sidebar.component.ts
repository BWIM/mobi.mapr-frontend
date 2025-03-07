import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { ProjectInfo } from '../projects/project.interface';
import { MapService } from '../map/map.service';
import { PdfGenerationService } from '../map/pdf-generation.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-details-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule,
    ProgressSpinnerModule
  ],
  templateUrl: './details-sidebar.component.html',
  styleUrl: './details-sidebar.component.css'
})
export class DetailsSidebarComponent implements OnInit, OnDestroy {
  projectInfo: ProjectInfo | null = null;
  private subscription: Subscription;
  isExporting: boolean = false;

  constructor(
    private translate: TranslateService,
    private projectsService: ProjectsService,
    private mapService: MapService,
    private pdfService: PdfGenerationService
  ) {
    this.subscription = this.projectsService.currentProjectInfo$.subscribe(
      info => {
        this.projectInfo = info;
      }
    );
  }

  async exportToPDFLandscape(): Promise<void> {
    try {
      this.isExporting = true;
      await this.pdfService.exportToPDFLandscape();
    } finally {
      this.isExporting = false;
    }
  }

  async exportToPDFPortrait(): Promise<void> {
    try {
      this.isExporting = true;
      await this.pdfService.exportToPDFPortrait();
    } finally {
      this.isExporting = false;
    }
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 