import { Component, OnInit, HostListener } from '@angular/core';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { SharedModule } from '../shared/shared.module';
import { ShareService } from './share.service';
import { ActivatedRoute } from '@angular/router';
import { ShareSidebarComponent } from './share-sidebar/share-sidebar.component';
import { ShareProject } from './share.interface';
import { LoadingService } from '../services/loading.service';
import { MapV2Component } from '../map-v2/map-v2.component';
import { MapV2Service } from '../map-v2/map-v2.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { AnalyzeService } from '../analyze/analyze.service';

@Component({
  selector: 'app-share',
  standalone: true,
  imports: [SharedModule, LoadingSpinnerComponent, ShareSidebarComponent, MapV2Component],
  templateUrl: './share.component.html',
  styleUrl: './share.component.css'
})
export class ShareComponent implements OnInit {
  detailsVisible: boolean = false;
  isRightPinned: boolean = false;
  projectKey: string = '';
  project: any = null;
  sharedProject: ShareProject | null = null;
  rightSidebarExpanded: boolean = false;
  isMobile: boolean = false;

  constructor(
    private shareService: ShareService, 
    private route: ActivatedRoute, 
    private loadingService: LoadingService,
    private mapService: MapV2Service,
    private analyzeService: AnalyzeService,
    private tutorialService: TutorialService
  ) {
    this.checkMobile();
    this.route.params.subscribe(params => {
      this.projectKey = params['key'];
    });
  }

  ngOnInit() {
    this.loadingService.startLoading();
    this.shareService.setIsShare(true);
    if (!localStorage.getItem('tutorialStatus') || localStorage.getItem('tutorialStatus') === 'false') {
      this.tutorialService.startTutorial('share');
    }
    
    // Subscribe to the sidebar expansion state
    this.shareService.isRightSidebarExpanded$.subscribe(expanded => {
      this.rightSidebarExpanded = expanded;
    });
    
    this.shareService.getProject(this.projectKey).subscribe(project => {
      this.project = project;
      if (project && project.id) {
        // Set the project in the map service with the share key
        this.mapService.setProject(project.id.toString(), this.projectKey);
        this.analyzeService.setCurrentProject(project.id.toString());
      }
    });
    this.shareService.getProjectDetails(this.projectKey).subscribe(project => {
      this.sharedProject = project;
      this.isRightPinned = true;
      this.toggleSidebar();
    });
    this.loadingService.stopLoading();
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkMobile();
  }

  private checkMobile(): void {
    this.isMobile = window.innerWidth < 768;
    
    // Auto-close sidebar on mobile when switching to desktop
    if (!this.isMobile && this.rightSidebarExpanded) {
      this.rightSidebarExpanded = false;
    }
  }

  toggleSidebar() {
    this.shareService.toggleRightSidebarExpanded();
  }
}
