import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';
import { County, Municipality, State } from '../interfaces/features';

export interface RankingsResponse {
  type: 'municipality' | 'county' | 'state';
  rankings: Array<{
    rank: number;
    id: number;
    name: string;
    score: number;
    index: number;
    population: number;
  }>;
}

export interface TopRankingsParams {
  type: 'municipality' | 'county' | 'state';
  profile_ids: number[];
  category_ids?: number[];
  persona_id?: number;
  regiostar_ids?: number[];
  state_ids?: number[];
  bewertung?: 'zeit' | 'qualitaet';
}

@Injectable({
  providedIn: 'root'
})
export class StatsService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);

  /**
   * Get the top 10 municipalities, counties, or states for a project
   */
  getTopRankings(params: TopRankingsParams): Observable<(County | Municipality | State)[]> {
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${this.apiUrl}/rankings/`;

    let httpParams = new HttpParams()
      .set('type', params.type)
      .set('profile_ids', params.profile_ids.join(','));

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

    // Add optional filter parameters
    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    if (params.persona_id !== undefined && params.persona_id !== null) {
      httpParams = httpParams.set('persona_id', params.persona_id.toString());
    }

    if (params.regiostar_ids && params.regiostar_ids.length > 0) {
      httpParams = httpParams.set('regiostar_ids', params.regiostar_ids.join(','));
    }

    if (params.state_ids && params.state_ids.length > 0) {
      httpParams = httpParams.set('state_ids', params.state_ids.join(','));
    }

    if (params.bewertung) {
      httpParams = httpParams.set('bewertung', params.bewertung);
    }

    return this.http.get<RankingsResponse>(url, { params: httpParams }).pipe(
      map(response => response.rankings as (County | Municipality | State)[])
    );
  }
}
