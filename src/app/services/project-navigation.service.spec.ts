import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ProjectNavigationService } from './project-navigation.service';
import { ProjectsService } from './project.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Project } from '../interfaces/project';
import { ProjectGroup } from '../interfaces/project-group';
import { ShareInfo } from '../interfaces/share';

function project(id: number, groups: ProjectGroup[] = [], share?: ShareInfo): Project {
  return {
    id,
    display_name: `P${id}`,
    description: '',
    owner: null,
    status: 'active',
    created: new Date(0),
    version: '1',
    base_profiles: [],
    groups,
    share,
  };
}

function member(id: number) {
  return { id, display_name: `P${id}` };
}

describe('ProjectNavigationService', () => {
  const currentProject = signal<Project | null>(null);
  const listedProjects = signal<Project[]>([]);
  const listedProjectsComplete = signal(false);
  let shareKey: string | null;
  let authenticated: boolean;
  let projectsService: jasmine.SpyObj<ProjectsService>;
  let session: jasmine.SpyObj<DashboardSessionService>;
  let router: jasmine.SpyObj<Router>;
  let service: ProjectNavigationService;

  const groupA: ProjectGroup = { id: 10, display_name: 'A', projects: [member(2), member(1), member(3)] };
  const groupB: ProjectGroup = { id: 20, display_name: 'B', projects: [member(1), member(4)] };

  beforeEach(() => {
    currentProject.set(null);
    listedProjects.set([]);
    listedProjectsComplete.set(false);
    shareKey = null;
    authenticated = true;

    projectsService = jasmine.createSpyObj<ProjectsService>(
      'ProjectsService',
      ['getProjectById', 'clearProject', 'setProject'],
      { project: currentProject, listedProjects, listedProjectsComplete }
    );
    projectsService.setProject.and.callFake((p: Project) => currentProject.set(p));
    projectsService.clearProject.and.callFake(() => currentProject.set(null));

    session = jasmine.createSpyObj<DashboardSessionService>('DashboardSessionService', [
      'getShareKey',
      'getIsAuthenticated',
      'setProjectId',
      'setShareKey',
    ]);
    session.getShareKey.and.callFake(() => shareKey);
    session.getIsAuthenticated.and.callFake(() => authenticated);

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: DashboardSessionService, useValue: session },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(ProjectNavigationService);
  });

  it('has no group sections for an ungrouped project', () => {
    currentProject.set(project(1));
    expect(service.groupSections()).toEqual([]);
    expect(service.hasGroup()).toBeFalse();
  });

  it('builds one section per group, keeping the group order', () => {
    currentProject.set(project(1, [groupA, groupB]));
    const sections = service.groupSections();
    expect(sections.map((s) => s.display_name)).toEqual(['A', 'B']);
    expect(sections[0].projects.map((p) => p.id)).toEqual([2, 1, 3]);
    expect(sections[1].projects.map((p) => p.id)).toEqual([1, 4]);
    expect(service.hasGroup()).toBeTrue();
  });

  it('only lists projects a logged-in user can open, once the list is known', () => {
    currentProject.set(project(1, [groupA]));
    listedProjects.set([project(1), project(3)]);
    listedProjectsComplete.set(true);
    expect(service.groupSections()[0].projects.map((p) => p.id)).toEqual([1, 3]);
  });

  it('only lists projects the share key grants', () => {
    authenticated = false;
    shareKey = 'abc';
    const share = { project_ids: [1, 2] } as ShareInfo;
    currentProject.set(project(1, [groupA], share));
    expect(service.groupSections()[0].projects.map((p) => p.id)).toEqual([2, 1]);
  });

  it('keeps the share key when switching projects and puts both into the URL', () => {
    authenticated = false;
    shareKey = 'abc';
    currentProject.set(project(1, [groupA], { project_ids: [1, 2] } as ShareInfo));
    const sibling = project(2, [groupA], { project_ids: [1, 2] } as ShareInfo);
    projectsService.getProjectById.and.returnValue(of(sibling));

    service.switchToProject(2, { closeOverview: true }).subscribe();

    expect(projectsService.getProjectById).toHaveBeenCalledWith(2, 'abc');
    expect(session.setProjectId).toHaveBeenCalledWith('2');
    expect(session.setShareKey).not.toHaveBeenCalled();
    const [, extras] = router.navigate.calls.mostRecent().args;
    expect(extras?.queryParams).toEqual(jasmine.objectContaining({
      share_key: 'abc',
      project_id: '2',
      overview: null,
      profile_ids: null,
    }));
  });

  it('switches by project id for logged-in users', () => {
    currentProject.set(project(1, [groupA]));
    projectsService.getProjectById.and.returnValue(of(project(3, [groupA])));

    service.switchToProject(3).subscribe();

    expect(projectsService.getProjectById).toHaveBeenCalledWith(3, null);
    const [, extras] = router.navigate.calls.mostRecent().args;
    expect(extras?.queryParams).toEqual(jasmine.objectContaining({ project_id: '3', share_key: null }));
  });

  it('does not reload the current project', () => {
    currentProject.set(project(1, [groupA]));
    service.switchToProject(1).subscribe();
    expect(projectsService.getProjectById).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
