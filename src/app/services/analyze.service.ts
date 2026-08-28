import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';
import { SessionService } from './session.service';

export interface AnalyzeParams {
  feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
  feature_id: number;
  profile_ids: number[];
  category_ids?: number[];
  persona_id?: number;
  top5?: boolean;
}

export interface CategoryScore {
  category_id: number;
  category_name: string;
  index: number;
  score: number;
  weight: number;
}

export interface AnalyzeResponse {
  categories: CategoryScore[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalyzeService {
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);
  private sessionService = inject(SessionService);

  /**
   * Gets category scores / weights for a feature from the API.
   * Optional persona_id only changes category weights (equal weights if omitted).
   */
  getAnalyze(params: AnalyzeParams): Observable<AnalyzeResponse> {
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/analyze/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_ids', params.profile_ids.join(','))
      .set('top5', params.top5 !== false ? 'true' : 'false')
      .set('lang', this.sessionService.getCurrentLanguage());

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    if (params.persona_id !== undefined && params.persona_id !== null) {
      httpParams = httpParams.set('persona_id', params.persona_id.toString());
    }

    return this.http.get<AnalyzeResponse>(url, { params: httpParams });
  }
}
