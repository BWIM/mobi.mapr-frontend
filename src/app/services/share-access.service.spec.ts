import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareAccessService, shareForbiddenFeature } from './share-access.service';
import { DashboardSessionService } from './dashboard-session.service';
import { ProjectsService } from './project.service';
import { Project } from '../interfaces/project';
import { ShareFeatures, ShareInfo } from '../interfaces/share';

const ALL_ON: ShareFeatures = {
  compare: true,
  difference: true,
  analyze: true,
  places: true,
  stats: true,
  export: true,
  filters: true,
};

function share(features: Partial<ShareFeatures> = {}): ShareInfo {
  return {
    label: '',
    project_id: 1,
    features: { ...ALL_ON, ...features },
    group_ids: [10],
    project_ids: [1, 2],
    profile_ids: null,
    state_ids: null,
    regiostar_ids: null,
    default_view: {},
    expire: null,
  };
}

function project(id: number, shareInfo?: ShareInfo): Project {
  return {
    id,
    display_name: `P${id}`,
    description: '',
    owner: null,
    status: 'active',
    created: new Date(0),
    version: '1',
    base_profiles: [],
    groups: [],
    share: shareInfo,
  };
}

function forbidden(feature: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 403, error: { error: 'Feature not available', feature } });
}

describe('ShareAccessService', () => {
  const shareKey = signal<string | null>(null);
  const isAuthenticated = signal(false);
  const currentProject = signal<Project | null>(null);
  let service: ShareAccessService;

  beforeEach(() => {
    shareKey.set(null);
    isAuthenticated.set(false);
    currentProject.set(null);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DashboardSessionService,
          useValue: {
            shareKey,
            accessMethod: computed(() => (shareKey() ? 'share_key' : isAuthenticated() ? 'project_id' : null)),
          },
        },
        { provide: ProjectsService, useValue: { project: currentProject } },
      ],
    });
    service = TestBed.inject(ShareAccessService);
  });

  it('allows everything without a share key', () => {
    isAuthenticated.set(true);
    currentProject.set(project(1));
    expect(service.share()).toBeNull();
    expect(service.canCompare()).toBeTrue();
    expect(service.canExport()).toBeTrue();
    expect(service.canEditAdvancedFilters()).toBeTrue();
  });

  it('follows the share feature flags', () => {
    shareKey.set('abc');
    currentProject.set(project(1, share({ difference: false, stats: false, filters: false })));
    expect(service.canCompare()).toBeTrue();
    expect(service.canUseDifference()).toBeFalse();
    expect(service.canUseStats()).toBeFalse();
    expect(service.canAnalyze()).toBeTrue();
    expect(service.canEditAdvancedFilters()).toBeFalse();
  });

  it('disables the difference view together with compare', () => {
    shareKey.set('abc');
    currentProject.set(project(1, share({ compare: false })));
    expect(service.canCompare()).toBeFalse();
    expect(service.canUseDifference()).toBeFalse();
  });

  it('keeps the share while switching to a sibling, but not for another key', () => {
    shareKey.set('abc');
    currentProject.set(project(1, share({ export: false })));
    expect(service.canExport()).toBeFalse();

    currentProject.set(null);
    expect(service.canExport()).toBeFalse();

    shareKey.set('other');
    expect(service.share()).toBeNull();
  });

  it('switches a feature off after a 403 from the backend', () => {
    shareKey.set('abc');
    currentProject.set(project(1, share()));
    expect(service.handleForbidden(forbidden('places'))).toBe('places');
    expect(service.canUsePlaces()).toBeFalse();
    expect(service.canAnalyze()).toBeTrue();

    shareKey.set('next');
    expect(service.canUsePlaces()).toBeTrue();
  });

  it('only reads 403 bodies that name a known feature', () => {
    expect(shareForbiddenFeature(forbidden('export'))).toBe('export');
    expect(shareForbiddenFeature(forbidden('teleport'))).toBeNull();
    expect(shareForbiddenFeature(new HttpErrorResponse({ status: 403, error: { error: 'x' } }))).toBeNull();
    expect(shareForbiddenFeature(new HttpErrorResponse({ status: 400, error: { feature: 'export' } }))).toBeNull();
    expect(shareForbiddenFeature(new Error('x'))).toBeNull();
  });
});
