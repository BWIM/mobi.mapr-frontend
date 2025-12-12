import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { SharedModule } from '../shared/shared.module';
import { ShareService } from './share.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ShareSidebarComponent } from './share-sidebar/share-sidebar.component';
import { ShareProjectbarComponent } from './share-projectbar/share-projectbar.component';
import { ShareProject } from './share.interface';
import { Project } from '../projects/project.interface';
import { LoadingService } from '../services/loading.service';
import { MapV2Component } from '../map-v2/map-v2.component';
import { MapV2Service } from '../map-v2/map-v2.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { AnalyzeService } from '../analyze/analyze.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-share',
  standalone: true,
  imports: [SharedModule, LoadingSpinnerComponent, ShareSidebarComponent, ShareProjectbarComponent, MapV2Component],
  templateUrl: './share.component.html',
  styleUrl: './share.component.css'
})
export class ShareComponent implements OnInit, OnDestroy {
  detailsVisible: boolean = false;
  isRightPinned: boolean = false;
  projectKey: string = '';
  project: any = null;
  sharedProject: ShareProject | null = null;
  rightSidebarExpanded: boolean = false;
  leftSidebarExpanded: boolean = false;
  isMobile: boolean = false;
  private destroy$ = new Subject<void>();

  constructor(
    private shareService: ShareService,
    private route: ActivatedRoute,
    private loadingService: LoadingService,
    private mapService: MapV2Service,
    private analyzeService: AnalyzeService,
    private tutorialService: TutorialService,
    private router: Router
  ) {
    this.checkMobile();
  }

  ngOnInit() {
    this.loadingService.startLoading();
    this.shareService.setIsShare(true);

    // Subscribe to route parameter changes
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const vizType = (params['type'] || '').toLowerCase();
        this.mapService.setVisualizationType(vizType === 'score' ? 'score' : 'index');
      });

    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      this.projectKey = params['key'];

      // Store the share key in sessionStorage for persistence across redirects
      if (this.projectKey) {
        sessionStorage.setItem('pendingShareKey', this.projectKey);
        // Set the share key in the service immediately so other components can use it
        this.shareService.setShareKey(this.projectKey);
      }

      // Check rate limit before loading the shared project
      this.loadSharedProject();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSharedProject(): void {
    // if (!localStorage.getItem('tutorialStatus') || localStorage.getItem('tutorialStatus') === 'false') {
    //   this.tutorialService.startTutorial('share');
    // }

    // Reset component state for new project
    this.project = null;
    this.sharedProject = null;
    this.isRightPinned = false;

    // Subscribe to the sidebar expansion state
    this.shareService.isRightSidebarExpanded$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(expanded => {
      this.rightSidebarExpanded = expanded;
    });

    this.shareService.getProject(this.projectKey).pipe(
      takeUntil(this.destroy$)
    ).subscribe(project => {
      this.project = project;
      if (project && project.id) {
        // For shared projects, we don't have full project data with creation date
        // So we'll create a minimal project object for the copyright display
        const minimalProject = {
          id: project.id,
          display_name: '', // Will be updated when project details are loaded
          created: new Date(), // Use current date as fallback
          calculated: 0,
          areas: 0,
          status: 'shared',
          version: 1
        } as Project;
        this.mapService.setProjectData(minimalProject);
        // Set the project in the map service with the share key
        this.mapService.setProject(project.id.toString(), this.projectKey, project.id as unknown as string);
        this.analyzeService.setCurrentProject(project.id.toString());
      }

      // Clear the pending share key once successfully loaded
      sessionStorage.removeItem('pendingShareKey');
    });

    this.shareService.getProjectDetails(this.projectKey).pipe(
      takeUntil(this.destroy$)
    ).subscribe(project => {
      this.sharedProject = project;
      this.isRightPinned = true;
      this.toggleSidebar();

      // Update the project data with the actual project name
      if (project && project.project_name && this.project) {
        const updatedProject = {
          ...this.project,
          display_name: project.project_name
        } as Project;
        this.mapService.setProjectData(updatedProject);
      }
    });

    this.loadingService.stopLoading();
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkMobile();
  }

  private checkMobile(): void {
    // More comprehensive mobile/tablet detection
    const width = window.innerWidth;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Consider devices with width < 1024px as mobile/tablet for better iPad support
    this.isMobile = width < 1024 || (isTouchDevice && width < 1200);

    // Auto-close sidebar on mobile when switching to desktop
    if (!this.isMobile && this.rightSidebarExpanded) {
      this.rightSidebarExpanded = false;
    }
  }

  toggleSidebar() {
    this.shareService.toggleRightSidebarExpanded();
  }

  toggleProjectbar() {
    this.leftSidebarExpanded = !this.leftSidebarExpanded;
  }
}
