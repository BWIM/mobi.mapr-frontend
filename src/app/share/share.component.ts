import { Component } from '@angular/core';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { SharedModule } from '../shared/shared.module';
import { ShareService } from './share.service';
import { ActivatedRoute } from '@angular/router';
import { ShareSidebarComponent } from './share-sidebar/share-sidebar.component';
import { ShareProject } from './share.interface';
import { LoadingService } from '../services/loading.service';
import { MapV2Component } from '../map-v2/map-v2.component';
import { MapV2Service } from '../map-v2/map-v2.service';

@Component({
  selector: 'app-share',
  standalone: true,
  imports: [SharedModule, LoadingSpinnerComponent, ShareSidebarComponent, MapV2Component],
  templateUrl: './share.component.html',
  styleUrl: './share.component.css'
})
export class ShareComponent {
  detailsVisible: boolean = false;
  rightSidebarExpanded: boolean = false;
  isRightPinned: boolean = false;
  projectKey: string = '';
  project: any = null;
  sharedProject: ShareProject | null = null;

  constructor(
    private shareService: ShareService, 
    private route: ActivatedRoute, 
    private loadingService: LoadingService,
    private mapService: MapV2Service
  ) {
    this.route.params.subscribe(params => {
      this.projectKey = params['key'];
    });
  }

  ngOnInit() {
    this.loadingService.startLoading();
    this.shareService.getProject(this.projectKey).subscribe(project => {
      this.project = project;
      if (project && project.id) {
        // Set the project in the map service with the share key
        this.mapService.setProject(project.id.toString(), this.projectKey);
      }
    });
    this.shareService.getProjectDetails(this.projectKey).subscribe(project => {
      this.sharedProject = project;
      this.isRightPinned = true;
      this.toggleSidebar();
    });
  }

  toggleSidebar() {
    this.rightSidebarExpanded = !this.rightSidebarExpanded;
  }
}
