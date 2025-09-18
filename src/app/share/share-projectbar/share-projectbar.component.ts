import { Component, OnInit, OnDestroy } from '@angular/core';
import { ProjectsService } from '../../projects/projects.service';
import { Project, ProjectGroup, PublicSharedProject } from '../../projects/project.interface';
import { SharedModule } from '../../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { LoadingService } from '../../services/loading.service';
import { MapV2Service } from '../../map-v2/map-v2.service';
import { AnalyzeService } from '../../analyze/analyze.service';
import { finalize } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';

interface ProjectTab {
    label: string;
    icon: string;
    projects: PublicSharedProject[];
    groupedProjects: { [groupId: string]: PublicSharedProject[] };
    ungroupedProjects: PublicSharedProject[];
    loading: boolean;
}

@Component({
    selector: 'app-share-projectbar',
    standalone: true,
    imports: [SharedModule],
    templateUrl: './share-projectbar.component.html',
    styleUrl: './share-projectbar.component.css'
})
export class ShareProjectbarComponent implements OnInit, OnDestroy {
    projectGroups: ProjectGroup[] = [];
    selectedProject?: PublicSharedProject;
    loading: boolean = false;

    // Tabbed interface properties
    activeTabIndex: number = 0;
    projectTabs: ProjectTab[] = [
        {
            label: 'PROJECTS.TABS.PUBLIC',
            icon: 'pi pi-globe',
            projects: [],
            groupedProjects: {},
            ungroupedProjects: [],
            loading: false
        }
    ];

    constructor(
        private projectsService: ProjectsService,
        private translate: TranslateService,
        private loadingService: LoadingService,
        private mapv2Service: MapV2Service,
        private analyzeService: AnalyzeService,
        private messageService: MessageService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        // Cleanup if needed
    }

    loadData(): void {
        this.loading = true;
        this.loadingService.startLoading();

        this.loadPublicSharedProjects();
    }

    private loadPublicSharedProjects(): void {
        const tab = this.projectTabs[0]; // Public projects tab
        tab.loading = true;

        this.projectsService.getPublicSharedProjects().subscribe({
            next: (response) => {
                tab.projects = response.results;
                this.processTabProjects(response.results, 0);
                tab.loading = false;
                this.loading = false;
                this.loadingService.stopLoading();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: this.translate.instant('COMMON.MESSAGES.ERROR.LOAD'),
                    detail: this.translate.instant('PROJECTS.LIST.NO_PROJECTS')
                });
                tab.loading = false;
                this.loading = false;
                this.loadingService.stopLoading();
            }
        });
    }

    private processTabProjects(projects: PublicSharedProject[], tabIndex: number): void {
        const tab = this.projectTabs[tabIndex];
        tab.projects = projects;

        // Group projects
        tab.groupedProjects = {};
        tab.ungroupedProjects = [];

        projects.forEach(project => {
            if (project.projectgroup) {
                const groupId = project.projectgroup.id.toString();
                if (!tab.groupedProjects[groupId]) {
                    tab.groupedProjects[groupId] = [];
                }
                tab.groupedProjects[groupId].push(project);
            } else {
                tab.ungroupedProjects.push(project);
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

        tab.loading = false;
    }

    getProgress(project: PublicSharedProject): number {
        // For public shared projects, we don't have areas field, so we'll use calculated as progress
        // This might need adjustment based on your business logic
        return project.calculated || 0;
    }

    showResults(project: PublicSharedProject | undefined): void {
        try {
            if (!project) return;

            // Reload the page with the share key in the URL
            this.router.navigate(['/share', project.share_key]);
        }
        catch (error) {
            console.error(error);
        }
    }

    getCurrentTab(): ProjectTab {
        return this.projectTabs[this.activeTabIndex];
    }

    getProjectGroupsForTab(tabIndex: number): ProjectGroup[] {
        // Only return groups that have projects in this tab
        const tab = this.projectTabs[tabIndex];
        return this.projectGroups.filter(group => {
            const projectsInGroup = tab.groupedProjects[group.id] || [];
            return projectsInGroup.length > 0;
        });
    }

    getGroupedProjectsForTab(tabIndex: number): { [groupId: string]: PublicSharedProject[] } {
        return this.projectTabs[tabIndex].groupedProjects;
    }

    getUngroupedProjectsForTab(tabIndex: number): PublicSharedProject[] {
        return this.projectTabs[tabIndex].ungroupedProjects;
    }
}
