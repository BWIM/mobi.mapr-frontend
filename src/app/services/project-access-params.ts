import { HttpParams } from '@angular/common/http';
import { DashboardSessionService } from './dashboard-session.service';

/**
 * Access params for project data endpoints.
 *
 * Share viewers always send their own key (it decides their rights) plus the project they look
 * at, which may be a sibling of the share's project: `?key=<key>&project=<id>`.
 * Logged-in users send only `?project=<id>`.
 */
export function buildProjectAccessParams(
  session: DashboardSessionService
): HttpParams {
  return appendProjectAccessParams(new HttpParams(), session);
}

export function appendProjectAccessParams(
  base: HttpParams,
  session: DashboardSessionService
): HttpParams {
  let params = base;
  const shareKey = session.getShareKey();
  const projectId = session.getProjectId();

  if (shareKey) {
    params = params.set('key', shareKey);
  }
  if (projectId) {
    params = params.set('project', projectId);
  }

  return params;
}

export function hasProjectAccess(session: DashboardSessionService): boolean {
  return !!session.getShareKey() || !!session.getProjectId();
}
