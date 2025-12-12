import { Component, OnInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { Project, ProjectInfo } from '../projects/project.interface';
// import { PdfGenerationService } from '../map-v2/pdf-generation.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShareService } from '../share/share.service';
import { StatisticsService } from '../statistics/statistics.service';
import { MapV2Service } from '../map-v2/map-v2.service';
import { ExportMapService } from '../map-v2/export-map/export-map.service';
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
  selectedVisualizationType: 'index' | 'score' = 'index';
  visualizationTypeOptions: { label: string; value: string }[] = [];
  @Output() projectLoaded = new EventEmitter<void>();
  comparisonProjects: Project[] = [];
  showComparisonDialog: boolean = false;
  selectedComparisonProject: Project | null = null;
  isComparisonMode: boolean = false;

  constructor(
    public translate: TranslateService,
    private projectsService: ProjectsService,
    // private pdfService: PdfGenerationService,
    private shareService: ShareService,
    private mapService: MapV2Service,
    private statisticsService: StatisticsService,
    private exportMapService: ExportMapService,
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

    // Subscribe to comparison mode changes
    this.subscription.add(
      this.mapService.comparison$.subscribe(
        isComparison => {
          this.isComparisonMode = isComparison;
        }
      )
    );

    // Initialize population area options with translated labels
    this.updatePopulationAreaOptions();

    // Initialize visualization type options with translated labels
    this.updateVisualizationTypeOptions();

    // Update options when language changes
    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        this.updatePopulationAreaOptions();
        this.updateVisualizationTypeOptions();
      })
    );
  }

  private updatePopulationAreaOptions(): void {
    this.populationAreaOptions = [
      { label: this.translate.instant('SIDEBAR.POPULATION'), value: 'pop' },
      { label: this.translate.instant('SIDEBAR.AREA'), value: 'area' }
    ];
  }

  private updateVisualizationTypeOptions(): void {
    this.visualizationTypeOptions = [
      { label: this.translate.instant('SIDEBAR.INDEX'), value: 'index' },
      { label: this.translate.instant('SIDEBAR.SCORE'), value: 'score' }
    ];
  }

  onVisualizationChange(): void {
    this.mapService.setAverageType(this.selectedPopulationArea === 'area' ? 'avg' : 'pop');
  }

  onVisualizationTypeChange(): void {
    this.mapService.setVisualizationType(this.selectedVisualizationType);
  }

  showPdfExportDialog() {
    this.exportMapService.showDialog();
  }

  async generateShareLink(): Promise<void> {
    if (this.projectInfo?.id) {
      this.isGeneratingShare = true;
      this.shareService.createShare(this.projectInfo.id, 'high').subscribe({
        next: (response) => {
          const baseUrl = window.location.origin;
          this.shareUrl = `${baseUrl}/share/${response}`;
          this.isGeneratingShare = false;
          this.copyToClipboard(this.shareUrl);
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

  ngOnInit() { }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  compareProjects(): void {
    if (!this.projectInfo?.id) return;
    this.projectsService.compareProjects(this.projectInfo.id).subscribe({
      next: (response: Project[]) => {
        this.comparisonProjects = response;
        this.showComparisonDialog = true;
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('SIDEBAR.COMPARISON_ERROR_TITLE'),
          detail: this.translate.instant('SIDEBAR.COMPARISON_ERROR_TITLE'),
          life: 3000
        });
      }
    });
  }

  onProjectSelect(project: Project): void {
    this.selectedComparisonProject = project;
    this.mapService.setComparisonProject(project);
    this.showComparisonDialog = false;
    this.shareUrl = null;
  }

  exitComparisonMode(): void {
    this.mapService.exitComparisonMode();
    this.selectedComparisonProject = null;
  }
} 