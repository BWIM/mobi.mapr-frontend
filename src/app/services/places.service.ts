import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { DashboardSessionService } from './dashboard-session.service';
import { SessionService } from './session.service';

export interface PlacesParams {
  feature_type: 'municipality' | 'hexagon';
  feature_id: number;
  profile_combination_id: number;
  category_ids?: number[];
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lon: number;
  category_id: number;
  category_name: string;
  [key: string]: any; // Allow additional properties
}

export interface CategoryData {
  weight: number;
  places: Place[];
  category_name: string;
}

export interface PlacesResponse {
  places: Place[];
  categories: CategoryData[];
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
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/places/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_combination_id', params.profile_combination_id.toString())
      .set('lang', this.sessionService.getCurrentLanguage())
      .set('category_id', params.category_ids?.join(',') || '');

    // Add project or key
    if (projectId) {
      httpParams = httpParams.set('project', projectId.toString());
    } else if (shareKey) {
      httpParams = httpParams.set('key', shareKey);
    }

    // Add optional category_ids parameter
    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    return this.http.get<any>(url, { params: httpParams }).pipe(
      map((response: any) => {
        console.log('Places API response:', response);
        // The API returns data with activity display names as keys
        // Each key maps to an object with "weight" and "places" array
        // Structure: { "Activity Display Name 1": { weight: 5, places: [...] } }
        const allPlaces: Place[] = [];
        
        const categories: CategoryData[] = [];
        
        // Iterate over all keys in the response (display names)
        for (const displayName in response) {
          const categoryData = response[displayName];
          
          // Check if this is the expected structure with places array
          if (categoryData && Array.isArray(categoryData.places)) {
            console.log(`Processing category "${displayName}" with ${categoryData.places.length} places`);
            
            const categoryPlaces = categoryData.places.map((item: any, index: number) => {
              const place: Place = {
                id: item.id !== undefined ? item.id : index, // Use index if id is missing
                name: item.name || 'Unnamed',
                lat: item.lat !== undefined && item.lat !== null ? item.lat : 0,
                lon: item.lng !== undefined && item.lng !== null ? item.lng : (item.lon !== undefined && item.lon !== null ? item.lon : 0), // Map lng to lon
                category_id: item.category_id !== undefined ? item.category_id : 0,
                category_name: displayName, // Use the display name as category name
                url: item.url // Preserve url if present
              };
              console.log(`Transformed place:`, place);
              return place;
            });
            
            allPlaces.push(...categoryPlaces);
            
            // Store category data with weight
            categories.push({
              weight: categoryData.weight || 0,
              places: categoryPlaces,
              category_name: displayName
            });
          }
        }
        
        console.log(`Total places extracted: ${allPlaces.length}`);
        return { places: allPlaces, categories };
      })
    );
  }

  /**
   * Gets the GeoJSON shape of a feature
   */
  getFeatureShape(params: {
    feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
    feature_id: number;
  }): Observable<any> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/shape/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString());

    // Add project or key
    if (projectId) {
      httpParams = httpParams.set('project', projectId.toString());
    } else if (shareKey) {
      httpParams = httpParams.set('key', shareKey);
    }

    return this.http.get<any>(url, { params: httpParams });
  }
}
