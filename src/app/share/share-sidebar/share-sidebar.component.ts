import { Component, Input, OnInit, OnDestroy, HostListener, Output, EventEmitter } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ShareProject } from '../share.interface';
import { StatisticsService } from '../../statistics/statistics.service';
import { MapV2Service } from '../../map-v2/map-v2.service';
import { GeocodingService, GeocodingResult } from '../../services/geocoding.service';
import { ProjectsService } from '../../projects/projects.service';
import { ProjectGroup, PublicSharedProject, ProjectInfo } from '../../projects/project.interface';
import { Router, ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { LoadingService } from '../../services/loading.service';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

type ScoreLevel = {
  name: string;
  description: string;
  descriptionMobile: string;
  min: number;
  max: number;
};

@Component({
  selector: 'app-share-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule,
    TooltipModule,
    FormsModule
  ],
  templateUrl: './share-sidebar.component.html',
  styleUrl: './share-sidebar.component.css'
})
export class ShareSidebarComponent implements OnInit, OnDestroy {
  @Input() sharedProject: ShareProject | null = null;
  @Input() isExpandedExternal: boolean = false;
  @Output() locationSelected = new EventEmitter<{ lng: number, lat: number }>();
  selectedVisualizationType: 'index' | 'score' = 'index';
  visualizationTypeOptions: { label: string; value: string }[] = [];
  isExpanded: boolean = false;
  isMobile: boolean = false;
  activeView: 'details' | 'projects' = 'details';

  // Search properties
  searchQuery: string = '';
  searchResults: GeocodingResult[] = [];
  showSearchResults: boolean = false;
  isSearchLoading: boolean = false;
  private searchSubject = new Subject<string>();

  // Project list properties
  projectGroups: ProjectGroup[] = [];
  selectedProject?: PublicSharedProject;
  projectsLoading: boolean = false;
  projects: PublicSharedProject[] = [];
  groupedProjects: { [groupId: string]: PublicSharedProject[] } = {};
  ungroupedProjects: PublicSharedProject[] = [];
  isScoreVisualization: boolean = false;

  // Legend properties
  legendLevels: ScoreLevel[] = [];
  isDifferenceMap: boolean = false;
  scoreHeader: string = '';
  differenceHeader: string = '';
  baselineProjectName: string = '';
  comparisonProjectName: string = '';
  defaultValues = [83, 72, 57, 42, 27].reverse();

  private subscription: Subscription = new Subscription();

  constructor(
    private translate: TranslateService,
    private statisticsService: StatisticsService,
    private mapService: MapV2Service,
    private geocodingService: GeocodingService,
    private projectsService: ProjectsService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService,
    private loadingService: LoadingService
  ) {
    // Setup search debouncing
    this.subscription.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(query => {
        this.performSearch(query);
      })
    );
  }

  ngOnInit(): void {
    this.checkMobile();
    // Initialize from current map setting (e.g., when set via URL param)
    this.selectedVisualizationType = this.mapService.getVisualizationType();
    this.updateVisualizationTypeOptions();
    this.isScoreVisualization = this.mapService.getVisualizationType() === 'score';
    // Auto-expand on mobile, collapsed on desktop (unless controlled externally)
    if (this.isExpandedExternal !== undefined) {
      this.isExpanded = this.isExpandedExternal;
    } else {
      this.isExpanded = this.isMobile;
    }

    // Default to details tab (info tab)
    // Only show projects tab if no shared project is available
    if (!this.sharedProject && this.projects.length > 0) {
      this.activeView = 'projects';
    } else {
      this.activeView = 'details';
    }

    // Load projects
    this.loadProjects();

    // Initialize legend
    this.initializeLegend();

    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        this.updateVisualizationTypeOptions();
        this.initializeLegend();
      })
    );

    // Keep toggle in sync with external changes (e.g., query param handling)
    this.subscription.add(
      this.mapService.visualizationType$.subscribe(type => {
        this.selectedVisualizationType = type;
      })
    );

    // Subscribe to project data to check if it's a difference map
    this.subscription.add(
      this.mapService.getCurrentProjectData$.subscribe(projectData => {
        this.isDifferenceMap = projectData?.difference === true;
      })
    );

    // Subscribe to project info for difference map names
    // Get initial value immediately
    const initialProjectInfo = this.projectsService.getCurrentProjectInfo();
    if (initialProjectInfo) {
      this.baselineProjectName = initialProjectInfo.baseline_project_name || '';
      this.comparisonProjectName = initialProjectInfo.comparison_project_name || '';
    }

    this.subscription.add(
      this.projectsService.currentProjectInfo$.subscribe(projectInfo => {
        if (projectInfo) {
          this.baselineProjectName = projectInfo.baseline_project_name || '';
          this.comparisonProjectName = projectInfo.comparison_project_name || '';
        }
      })
    );
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkMobile();
  }

  private checkMobile(): void {
    this.isMobile = window.innerWidth <= 768;
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private updateVisualizationTypeOptions(): void {
    this.visualizationTypeOptions = [
      { label: this.translate.instant('SIDEBAR.INDEX'), value: 'index' },
      { label: this.translate.instant('SIDEBAR.SCORE'), value: 'score' }
    ];
  }

  onVisualizationTypeChange(): void {
    this.mapService.setVisualizationType(this.selectedVisualizationType);
  }

  setVisualizationType(type: 'index' | 'score'): void {
    this.selectedVisualizationType = type;
    this.onVisualizationTypeChange();
  }

  toggleStatistics(): void {
    this.statisticsService.visible = true;
  }

  getModeIcon(mode: string): string {
    const modeLower = mode.toLowerCase();
    if (modeLower.includes('fuß') || modeLower.includes('foot') || modeLower.includes('walk')) {
      return 'pi pi-walking';
    } else if (modeLower.includes('fahrrad') || modeLower.includes('bike') || modeLower.includes('bicycle') || modeLower.includes('rad')) {
      return 'pi pi-bicycle';
    } else if (modeLower.includes('auto') || modeLower.includes('car') || modeLower.includes('pkw')) {
      return 'pi pi-car';
    } else if (modeLower.includes('öpnv') || modeLower.includes('public') || modeLower.includes('transit') || modeLower.includes('bus')) {
      return 'pi pi-bus';
    } else {
      return 'pi pi-circle';
    }
  }

  // Search methods
  onSearchInput(): void {
    if (this.searchQuery.length < 2) {
      this.showSearchResults = false;
      this.searchResults = [];
      return;
    }
    this.searchSubject.next(this.searchQuery);
  }

  private performSearch(query: string): void {
    this.isSearchLoading = true;
    this.showSearchResults = true;

    this.geocodingService.search(query).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.isSearchLoading = false;
      },
      error: (error) => {
        console.error('Geocoding error:', error);
        this.searchResults = [];
        this.isSearchLoading = false;
      }
    });
  }

  selectLocation(location: GeocodingResult): void {
    this.locationSelected.emit({ lng: location.lng, lat: location.lat });
    this.searchQuery = '';
    this.showSearchResults = false;
    this.searchResults = [];
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.showSearchResults = false;
    this.searchResults = [];
  }

  // Project list methods
  loadProjects(): void {
    const routeKey = this.route.snapshot.params['key'];
    const sessionKey = sessionStorage.getItem('pendingShareKey');
    const shareKey = routeKey || sessionKey;

    this.projectsLoading = true;
    this.projectsService.getPublicSharedProjects(shareKey || '').subscribe({
      next: (response) => {
        this.projects = response.results;
        this.processProjects(response.results);
        this.projectsLoading = false;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
          detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
        });
        this.projectsLoading = false;
      }
    });
  }

  private processProjects(projects: PublicSharedProject[]): void {
    this.projects = projects;
    this.groupedProjects = {};
    this.ungroupedProjects = [];

    projects.forEach(project => {
      if (project.projectgroup) {
        const groupId = project.projectgroup.id.toString();
        if (!this.groupedProjects[groupId]) {
          this.groupedProjects[groupId] = [];
        }
        this.groupedProjects[groupId].push(project);
      } else {
        this.ungroupedProjects.push(project);
      }
    });

    // Extract unique project groups for display
    this.projectGroups = [];
    projects.forEach(project => {
      if (project.projectgroup && !this.projectGroups.find(g => g.id === project.projectgroup.id.toString())) {
        this.projectGroups.push({
          id: project.projectgroup.id.toString(),
          name: project.projectgroup.name,
          user: project.projectgroup.user.toString(),
          description: project.projectgroup.description,
          default: project.projectgroup.default
        });
      }
    });
  }

  getProjectGroups(): ProjectGroup[] {
    return this.projectGroups.filter(group => {
      const projectsInGroup = this.groupedProjects[group.id] || [];
      return projectsInGroup.length > 0;
    });
  }

  showProjectResults(project: PublicSharedProject | undefined): void {
    try {
      if (!project) return;

      if (this.isScoreVisualization) {
        this.router.navigate(['/share', project.share_key], { queryParams: { type: 'score' } });
      } else {
        this.router.navigate(['/share', project.share_key]);
      }
    } catch (error) {
      console.error(error);
    }
  }

  switchView(view: 'details' | 'projects'): void {
    this.activeView = view;
  }

  private initializeLegend(): void {
    const defaultValues = this.defaultValues;

    this.translate.get(['LEGEND.LVLA', 'LEGEND.LVLB', 'LEGEND.LVLC', 'LEGEND.LVLD', 'LEGEND.LVLE', 'LEGEND.LVLF']).subscribe(translations => {
      this.legendLevels = [
        {
          name: 'A',
          description: translations['LEGEND.LVLA'],
          descriptionMobile: "<35%",
          min: defaultValues[4],
          max: 100
        },
        {
          name: 'B',
          description: translations['LEGEND.LVLB'],
          descriptionMobile: "35-50%",
          min: defaultValues[3],
          max: defaultValues[4]
        },
        {
          name: 'C',
          description: translations['LEGEND.LVLC'],
          descriptionMobile: "51-71%",
          min: defaultValues[2],
          max: defaultValues[3]
        },
        {
          name: 'D',
          description: translations['LEGEND.LVLD'],
          descriptionMobile: "72-100%",
          min: defaultValues[1],
          max: defaultValues[2]
        },
        {
          name: 'E',
          description: translations['LEGEND.LVLE'],
          descriptionMobile: "101-140%",
          min: defaultValues[0],
          max: defaultValues[1]
        },
        {
          name: 'F',
          description: translations['LEGEND.LVLF'],
          descriptionMobile: ">141%",
          min: 0,
          max: defaultValues[0]
        }
      ];
    });

    this.translate.get('LEGEND.SCORE_HEADER').subscribe(translation => {
      this.scoreHeader = translation;
    });

    this.translate.get('LEGEND.DIFFERENCE_HEADER').subscribe(translation => {
      this.differenceHeader = translation;
    });
  }
}
