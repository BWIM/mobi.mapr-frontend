import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { ProjectsService } from '../services/project.service';
import { DashboardSessionService } from '../services/dashboard-session.service';
import { AuthService } from '../auth/auth.service';
import { Project } from '../interfaces/project';

@Component({
  selector: 'app-users-area',
  imports: [CommonModule, SharedModule],
  templateUrl: './users-area.component.html',
  styleUrl: './users-area.component.css',
})
export class UsersAreaComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);
  private router = inject(Router);

  projects = signal<Project[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  selectedProjectId = signal<number | null>(null);

  ngOnInit(): void {
    // Redirect to login if not authenticated
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    // Load the currently selected project if any
    const currentProjectId = this.dashboardSessionService.getProjectId();
    if (currentProjectId) {
      this.selectedProjectId.set(Number(currentProjectId));
    }

    // Load projects
    this.loadProjects();
  }

  private loadProjects(): void {
    this.loading.set(true);
    this.error.set(null);

    this.projectsService.getProjects(1, 100).subscribe({
      next: (response) => {
        this.projects.set(response.results);
        console.log(this.projects());
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading projects:', err);
        this.error.set('Fehler beim Laden der Projekte');
        this.loading.set(false);
      }
    });
  }

  selectProject(project: Project): void {
    this.selectedProjectId.set(project.id);
    // Set project ID in session service
    this.dashboardSessionService.setProjectId(project.id.toString());
    // Navigate to dashboard
    this.router.navigate(['/dashboard'], { queryParams: { project_id: project.id } });
  }

  isProjectSelected(projectId: number): boolean {
    return this.selectedProjectId() === projectId;
  }
}
