import { HttpParams } from '@angular/common/http';
import { DashboardSessionService } from './dashboard-session.service';

export function buildProjectAccessParams(
  session: DashboardSessionService
): HttpParams {
  const shareKey = session.getShareKey();
  const effectiveId = session.getEffectiveProjectId();
  let params = new HttpParams();

  if (shareKey) {
    params = params.set('key', shareKey);
    if (effectiveId) {
      params = params.set('project', effectiveId);
    }
  } else if (effectiveId) {
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
  const effectiveId = session.getEffectiveProjectId();

  if (shareKey) {
    params = params.set('key', shareKey);
    if (effectiveId) {
      params = params.set('project', effectiveId);
    }
  } else if (effectiveId) {
    params = params.set('project', effectiveId);
  }

  return params;
}

export function hasProjectAccess(session: DashboardSessionService): boolean {
  return !!session.getShareKey() || !!session.getEffectiveProjectId();
}
