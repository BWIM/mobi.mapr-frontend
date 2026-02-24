import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DashboardSessionService } from './dashboard-session.service';
import { AuthService } from '../auth/auth.service';
import { SessionService } from './session.service';

export interface AnalyzeParams {
  feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
  feature_id: number;
  profile_combination_id: number;
  category_ids?: number[];
  persona_ids?: number[];
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
  private authService = inject(AuthService);
  private sessionService = inject(SessionService);

  /**
   * Gets the top 5 activities (categories) for a feature from the API
   */
  getAnalyze(params: AnalyzeParams): Observable<AnalyzeResponse> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/analyze/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_combination_id', params.profile_combination_id.toString())
      .set('top5', params.top5 !== false ? 'true' : 'false')
      .set('lang', this.sessionService.getCurrentLanguage());

    // Add project or key
    if (projectId) {
      httpParams = httpParams.set('project', projectId.toString());
    } else if (shareKey) {
      httpParams = httpParams.set('key', shareKey);
    }

    // Add optional filter parameters
    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    if (params.persona_ids && params.persona_ids.length > 0) {
      httpParams = httpParams.set('persona_ids', params.persona_ids.join(','));
    }

    return this.http.get<AnalyzeResponse>(url, { params: httpParams });
  }
}
