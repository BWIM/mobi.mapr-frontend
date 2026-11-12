import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, buildProjectAccessParams, hasProjectAccess } from './project-access-params';
import { HttpParams } from '@angular/common/http';

function session(shareKey: string | null, projectId: string | null): DashboardSessionService {
  return {
    getShareKey: () => shareKey,
    getProjectId: () => projectId,
  } as DashboardSessionService;
}

describe('project access params', () => {
  it('keeps the share key next to the (sibling) project', () => {
    const params = buildProjectAccessParams(session('abc', '7'));
    expect(params.get('key')).toBe('abc');
    expect(params.get('project')).toBe('7');
  });

  it('sends only the key before a project is known', () => {
    const params = buildProjectAccessParams(session('abc', null));
    expect(params.get('key')).toBe('abc');
    expect(params.has('project')).toBeFalse();
  });

  it('sends only the project for logged-in users', () => {
    const params = appendProjectAccessParams(new HttpParams().set('type', 'county'), session(null, '3'));
    expect(params.get('type')).toBe('county');
    expect(params.get('project')).toBe('3');
    expect(params.has('key')).toBeFalse();
  });

  it('reports access', () => {
    expect(hasProjectAccess(session(null, null))).toBeFalse();
    expect(hasProjectAccess(session('abc', null))).toBeTrue();
    expect(hasProjectAccess(session(null, '1'))).toBeTrue();
  });
});
