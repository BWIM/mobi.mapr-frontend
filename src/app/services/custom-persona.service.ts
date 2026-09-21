import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../interfaces/http';
import {
  CustomPersona,
  PersonaActivityWeight,
  PersonaTemplate,
} from '../interfaces/custom-persona';
import { Project } from '../interfaces/project';

export interface PreviewGeoJson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: Record<string, unknown>;
    properties: {
      id: number;
      name: string;
      score: number;
      index: number;
    };
  }>;
}

export interface CustomPersonaPublishResponse {
  project: Project;
  baked: boolean;
  persona: CustomPersona;
}

export interface CustomPersonaUpdatePayload {
  display_name?: string;
  description?: string | null;
  can_use_car?: boolean;
  weights?: Pick<PersonaActivityWeight, 'activity_id' | 'weight'>[];
}

export interface CustomPersonaPreviewOptions {
  profileIds?: number[];
  regiostarIds?: number[];
}

export interface CustomPersonaRebakeResponse {
  project_ids: number[];
  persona: CustomPersona;
}

@Injectable({
  providedIn: 'root',
})
export class CustomPersonaService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  getTemplates(page = 1, pageSize = 100): Observable<PaginatedResponse<PersonaTemplate>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
    return this.http.get<PaginatedResponse<PersonaTemplate>>(
      `${this.apiUrl}/persona-templates/`,
      { params }
    );
  }

  getCustomPersonas(page = 1, pageSize = 100): Observable<PaginatedResponse<CustomPersona>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
    return this.http.get<PaginatedResponse<CustomPersona>>(
      `${this.apiUrl}/custom-personas/`,
      { params }
    );
  }

  getCustomPersona(id: number): Observable<CustomPersona> {
    return this.http.get<CustomPersona>(`${this.apiUrl}/custom-personas/${id}/`);
  }

  createFromTemplate(basedOn: number): Observable<CustomPersona> {
    return this.http.post<CustomPersona>(`${this.apiUrl}/custom-personas/`, {
      based_on: basedOn,
    });
  }

  updateCustomPersona(
    id: number,
    payload: CustomPersonaUpdatePayload
  ): Observable<CustomPersona> {
    return this.http.patch<CustomPersona>(`${this.apiUrl}/custom-personas/${id}/`, payload);
  }

  deleteCustomPersona(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/custom-personas/${id}/`);
  }

  getPreviewGeoJson(
    id: number,
    options?: CustomPersonaPreviewOptions
  ): Observable<PreviewGeoJson> {
    let params = new HttpParams();
    if (options?.profileIds?.length) {
      params = params.set('profile_ids', options.profileIds.join(','));
    }
    if (options?.regiostarIds?.length) {
      params = params.set('regiostar_ids', options.regiostarIds.join(','));
    }
    return this.http.get<PreviewGeoJson>(
      `${this.apiUrl}/custom-personas/${id}/geojson/`,
      { params }
    );
  }

  publish(id: number, duplicate = false): Observable<CustomPersonaPublishResponse> {
    let params = new HttpParams();
    if (duplicate) {
      params = params.set('duplicate', 'true');
    }
    return this.http.post<CustomPersonaPublishResponse>(
      `${this.apiUrl}/custom-personas/${id}/publish/`,
      {},
      { params }
    );
  }

  rebake(id: number): Observable<CustomPersonaRebakeResponse> {
    return this.http.post<CustomPersonaRebakeResponse>(
      `${this.apiUrl}/custom-personas/${id}/rebake/`,
      {}
    );
  }
}

