import { Component } from '@angular/core';
import { LoadingSpinnerComponent } from '../shared/loading-spinner/loading-spinner.component';
import { SharedModule } from '../shared/shared.module';
import { MapComponent } from '../map/map.component';
import { ShareService } from './share.service';
import { ActivatedRoute } from '@angular/router';
import { MapService } from '../map/map.service';
import { ShareSidebarComponent } from './share-sidebar/share-sidebar.component';
import { ShareProject } from './share.interface';
import { LoadingService } from '../services/loading.service';

@Component({
  selector: 'app-share',
  standalone: true,
  imports: [SharedModule, MapComponent, LoadingSpinnerComponent, ShareSidebarComponent],
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
  constructor(private shareService: ShareService, private route: ActivatedRoute, private mapService: MapService, private loadingService: LoadingService) {
    this.route.params.subscribe(params => {
      this.projectKey = params['key'];
    });
  }

  ngOnInit() {
    this.loadingService.startLoading();
    this.shareService.getProject(this.projectKey).subscribe(project => {
      this.project = project;
      this.mapService.updateFeatures(project.geojson.features);
      this.loadingService.stopLoading();
    });
    this.shareService.getProjectDetails(this.projectKey).subscribe(project => {
      this.sharedProject = project;
      this.isRightPinned = true;
      this.showRightSidebar();
    });
  }

  showRightSidebar() {
    this.rightSidebarExpanded = true;
  }

  toggleRightPin() {
    this.isRightPinned = !this.isRightPinned;
  }
}
