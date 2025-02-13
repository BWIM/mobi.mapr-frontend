import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from './project.interface';
import { ProjectsService } from './projects.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-projects',
    templateUrl: './projects.component.html',
    styleUrls: ['./projects.component.css'],
    standalone: true,
    imports: [CommonModule, TranslateModule]
})
export class ProjectsComponent {
    projects: Project[] = [];

    constructor(
        private projectsService: ProjectsService
    ) {}

    ngOnInit() {
        // Hier später die Projekte laden
    }
}
