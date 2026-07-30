import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';
import { SessionService } from './session.service';
import { CompositionNode, CompositionRoleHint } from '../interfaces/composition';

export interface PlacesParams {
  feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
  feature_id: number;
  profile_ids: number[];
  category_ids?: number[];
  /**
   * When true, the API returns composition + activity scores without place geometries
   * (places arrays stay empty). Use for the analyze summary panel.
   */
  simplified?: boolean;
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lon: number;
  category_id: number;
  category_name: string;
  activity_id?: number;
  [key: string]: any;
}

export interface CategoryData {
  weight: number;
  places: Place[];
  category_name: string;
  activity_id?: number;
  name?: string;
  role_hint?: CompositionRoleHint;
  activityScore?: {
    score: number;
    index: number;
  };
}

export interface PlacesResponse {
  places: Place[];
  categories: CategoryData[];
  composition: CompositionNode | null;
  profile_ids?: number[];
}

@Injectable({
  providedIn: 'root'
})
export class PlacesService {
  private http = inject(HttpClient);
  private dashboardSessionService = inject(DashboardSessionService);
  private sessionService = inject(SessionService);

  /**
   * Gets places for a feature from the API
   */
  getPlaces(params: PlacesParams): Observable<PlacesResponse> {
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/places/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_ids', params.profile_ids.join(','))
      .set('lang', this.sessionService.getCurrentLanguage());

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    if (params.simplified) {
      httpParams = httpParams.set('simplified', 'true');
    }

    return this.http.get<any>(url, { params: httpParams }).pipe(
      map((response: any) => this.normalizePlacesResponse(response))
    );
  }

  private normalizePlacesResponse(response: any): PlacesResponse {
    const composition: CompositionNode | null =
      response?.composition && typeof response.composition === 'object'
        ? response.composition
        : null;

    const profile_ids = Array.isArray(response?.profile_ids)
      ? response.profile_ids.map((id: any) => Number(id))
      : undefined;

    const allPlaces: Place[] = [];
    const categories: CategoryData[] = [];

    const activities = response?.activities;
    if (activities && typeof activities === 'object' && !Array.isArray(activities)) {
      for (const key of Object.keys(activities)) {
        const entry = activities[key];
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const placeItems = Array.isArray(entry.places) ? entry.places : [];
        const activityId = Number(entry.activity_id ?? key);
        const displayName =
          entry.display_name || entry.name || `Activity ${activityId}`;
        const categoryPlaces = this.mapPlaces(placeItems, displayName, activityId);
        allPlaces.push(...categoryPlaces);
        categories.push({
          weight: entry.weight || 0,
          places: categoryPlaces,
          category_name: displayName,
          activity_id: Number.isFinite(activityId) ? activityId : undefined,
          name: entry.name,
          role_hint: entry.role_hint === 'primary' || entry.role_hint === 'substitute'
            ? entry.role_hint
            : undefined,
          activityScore:
            entry.activityScore && typeof entry.activityScore === 'object'
              ? {
                  score: Number(entry.activityScore.score ?? 0),
                  index: Number(entry.activityScore.index ?? 0),
                }
              : undefined,
        });
      }
    } else {
      // Legacy flat display-name keys
      for (const displayName in response) {
        if (
          displayName === 'composition' ||
          displayName === 'activities' ||
          displayName === 'profile_ids'
        ) {
          continue;
        }
        const categoryData = response[displayName];
        if (!categoryData || typeof categoryData !== 'object') {
          continue;
        }
        const placeItems = Array.isArray(categoryData.places) ? categoryData.places : [];
        const categoryPlaces = this.mapPlaces(placeItems, displayName);
        allPlaces.push(...categoryPlaces);
        categories.push({
          weight: categoryData.weight || 0,
          places: categoryPlaces,
          category_name: displayName,
          activityScore:
            categoryData.activityScore && typeof categoryData.activityScore === 'object'
              ? {
                  score: Number(categoryData.activityScore.score ?? 0),
                  index: Number(categoryData.activityScore.index ?? 0),
                }
              : undefined,
        });
      }
    }

    categories.sort((a, b) => b.weight - a.weight);

    return { places: allPlaces, categories, composition, profile_ids };
  }

  private mapPlaces(
    items: any[],
    displayName: string,
    activityId?: number
  ): Place[] {
    return items.map((item: any, index: number) => ({
      id: item.id !== undefined ? item.id : index,
      name: item.name || 'Unnamed',
      lat: item.lat !== undefined && item.lat !== null ? item.lat : 0,
      lon:
        item.lng !== undefined && item.lng !== null
          ? item.lng
          : item.lon !== undefined && item.lon !== null
            ? item.lon
            : 0,
      category_id: item.category_id !== undefined ? item.category_id : 0,
      category_name: displayName,
      activity_id: activityId,
      url: item.url,
    }));
  }

  /**
   * Gets the GeoJSON shape of a feature
   */
  getFeatureShape(params: {
    feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
    feature_id: number;
  }): Observable<any> {
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/shape/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString());

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

    return this.http.get<any>(url, { params: httpParams });
  }
}
