import { HttpParams } from '@angular/common/http';
import { DashboardSessionService } from './dashboard-session.service';

export function buildProjectAccessParams(
  session: DashboardSessionService
): HttpParams {
  const shareKey = session.getShareKey();
  let params = new HttpParams();

  if (shareKey) {
    params = params.set('key', shareKey);
  } else if (session.getEffectiveProjectId()) {
    const effectiveId = session.getEffectiveProjectId()!;
    params = params.set('project', effectiveId);
  }

  return params;
}

export function appendProjectAccessParams(
  base: HttpParams,
  session: DashboardSessionService
): HttpParams {
  let params = base;
  const shareKey = session.getShareKey();

  if (shareKey) {
    params = params.set('key', shareKey);
  } else if (session.getEffectiveProjectId()) {
    const effectiveId = session.getEffectiveProjectId()!;
    params = params.set('project', effectiveId);
  }

  return params;
}

export function hasProjectAccess(session: DashboardSessionService): boolean {
  return !!session.getShareKey() || !!session.getEffectiveProjectId();
}
