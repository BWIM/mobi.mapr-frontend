import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface GeocodingResult {
  name: string;
  lng: number;
  lat: number;
  display_name: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  constructor(private http: HttpClient) {}

  search(query: string): Observable<GeocodingResult[]> {
    const params = {
      q: query,
      format: 'json',
      limit: '10',
      addressdetails: '1',
      countrycodes: 'de', // Limit to Germany
      'accept-language': 'de,en'
    };

    return this.http.get<any[]>(this.NOMINATIM_URL, { params }).pipe(
      map(results => results.map(result => ({
        name: result.display_name,
        lng: parseFloat(result.lon),
        lat: parseFloat(result.lat),
        display_name: result.display_name
      })))
    );
  }
} 