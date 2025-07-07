import { Component, OnInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { ProjectInfo } from '../projects/project.interface';
// import { PdfGenerationService } from '../map-v2/pdf-generation.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShareService } from '../share/share.service';
import { StatisticsService } from '../statistics/statistics.service';
import { MapV2Service } from '../map-v2/map-v2.service';
import { PdfExportService } from '../map-v2/pdf-export-dialog/pdf-export.service';
import { MessageService } from 'primeng/api';

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
  @Input() projectInfo: ProjectInfo | null = null;
  private subscription: Subscription;
  isExporting: boolean = false;
  shareUrl: string | null = null;
  isGeneratingShare: boolean = false;
  selectedAverageType: 'mean' | 'median' = 'mean';
  selectedPopulationArea: string = 'pop';
  populationAreaOptions: { label: string; value: string }[] = [];
  @Output() projectLoaded = new EventEmitter<void>();

  constructor(
    private translate: TranslateService,
    private projectsService: ProjectsService,
    // private pdfService: PdfGenerationService,
    private shareService: ShareService,
    private mapService: MapV2Service,
    private statisticsService: StatisticsService,
    private pdfExportService: PdfExportService,
    private messageService: MessageService
  ) {
    this.subscription = new Subscription();
    
    this.subscription.add(
      this.projectsService.currentProjectInfo$.subscribe(
        info => {
          this.projectInfo = info;
          if (info) {
            this.projectLoaded.emit();
          }
        }
      )
    );

    // Initialize population area options with translated labels
    this.updatePopulationAreaOptions();
    
    // Update options when language changes
    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        this.updatePopulationAreaOptions();
      })
    );
  }

  private updatePopulationAreaOptions(): void {
    this.populationAreaOptions = [
      { label: this.translate.instant('SIDEBAR.POPULATION'), value: 'pop' },
      { label: this.translate.instant('SIDEBAR.AREA'), value: 'area' }
    ];
  }

  onVisualizationChange(): void {
    this.mapService.setAverageType(this.selectedPopulationArea === 'area' ? 'avg' : 'pop');
  }

  showPdfExportDialog() {
    this.pdfExportService.showDialog();
  }

  async generateShareLink(): Promise<void> {
    if (this.projectInfo?.id) {
      this.isGeneratingShare = true;
      this.shareService.createShare(this.projectInfo.id, 'high').subscribe({
        next: (response) => {
          const baseUrl = window.location.origin;
          this.shareUrl = `${baseUrl}/share/${response}`;
          this.isGeneratingShare = false;
        },
        error: (error) => {
          console.error('Error generating share link:', error);
          this.isGeneratingShare = false;
        }
      });
    }
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(
      () => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('SIDEBAR.COPY_LINK_SUCCESS_TITLE'),
          detail: this.translate.instant('SIDEBAR.COPY_LINK_SUCCESS_MESSAGE'),
          life: 3000
        });
      },
      (err) => {
        console.error('Could not copy text: ', err);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('SIDEBAR.COPY_LINK_ERROR_TITLE'),
          detail: this.translate.instant('SIDEBAR.COPY_LINK_ERROR_MESSAGE'),
          life: 3000
        });
      }
    );
  }

  toggleStatistics(): void {
    this.statisticsService.visible = true;
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 