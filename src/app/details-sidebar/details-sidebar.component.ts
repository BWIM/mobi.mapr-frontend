import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { ProjectInfo } from '../projects/project.interface';
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
export class DetailsSidebarComponent implements OnInit, OnDestroy {
  projectInfo: ProjectInfo | null = null;
  private subscription: Subscription;

  constructor(
    private translate: TranslateService,
    private projectsService: ProjectsService
  ) {
    this.subscription = this.projectsService.currentProjectInfo$.subscribe(
      info => {
        this.projectInfo = info;
      }
    );
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 