import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService } from '../../services/project.service';

@Component({
  selector: 'app-bottom',
  imports: [CommonModule],
  templateUrl: './bottom.component.html',
  styleUrl: './bottom.component.css',
})
export class BottomComponent {
  private projectsService = inject(ProjectsService);
  project = this.projectsService.project;

}
