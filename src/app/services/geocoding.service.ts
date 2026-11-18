import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A place found by the map search. */
export interface GeocodingResult {
  label: string;
  lat: number;
  lon: number;
}

/** The parts of a Photon feature we read (GeoJSON, coordinates are [lon, lat]). */
interface PhotonFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

/** Queries shorter than this are not sent. */
export const GEOCODING_MIN_QUERY_LENGTH = 3;
/** Germany (west, south, east, north) — same box as the content tiles. */
const GERMANY_BBOX = '5.8,47.2,15.1,55.1';
const RESULT_LIMIT = 10;
const DEBOUNCE_MS = 300;
const CACHE_SIZE = 50;

/** "Hauptstraße 5, 04109, Leipzig, Sachsen": non-empty parts, duplicates dropped. */
export function buildPhotonLabel(properties: PhotonFeature['properties']): string {
  const p = properties ?? {};
  const street = [p.street, p.housenumber].map((part) => part?.trim()).filter(Boolean).join(' ');
  const parts = [p.name, street, p.postcode, p.city, p.state];

  const seen = new Set<string>();
  const label: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part || seen.has(part.toLowerCase())) {
      continue;
    }
    seen.add(part.toLowerCase());
    label.push(part);
  }
  return label.join(', ');
}

/** German results of a Photon response as app-level results (others and broken entries dropped). */
export function mapPhotonResponse(response: PhotonResponse | null | undefined): GeocodingResult[] {
  const results: GeocodingResult[] = [];
  const labels = new Set<string>();
  for (const feature of response?.features ?? []) {
    // The bbox also covers border areas of neighbouring countries.
    if (feature.properties?.countrycode?.toUpperCase() !== 'DE') {
      continue;
    }
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      continue;
    }
    const [lon, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const label = buildPhotonLabel(feature.properties);
    // Long streets come back as several segments with the same label: show one entry.
    if (!label || labels.has(label)) {
      continue;
    }
    labels.add(label);
    results.push({ label, lat, lon });
  }
  return results;
}

/**
 * Place search for the map (Photon, built for search-as-you-type; Nominatim's usage policy
 * forbids autocomplete). Results are cached per query for the session.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private http = inject(HttpClient);
  private cache = new Map<string, GeocodingResult[]>();

  /** One search; failures yield an empty list. */
  search(query: string): Observable<GeocodingResult[]> {
    const normalized = query.trim();
    if (normalized.length < GEOCODING_MIN_QUERY_LENGTH) {
      return of([]);
    }
    const key = normalized.toLowerCase();
    const cached = this.cache.get(key);
    if (cached) {
      return of(cached);
    }

    const params = new HttpParams()
      .set('q', normalized)
      .set('limit', RESULT_LIMIT)
      .set('lang', 'de')
      .set('bbox', GERMANY_BBOX);

    return this.http.get<PhotonResponse>(`${environment.photonUrl}/api/`, { params }).pipe(
      map(mapPhotonResponse),
      tap((results) => this.remember(key, results)),
      catchError((error) => {
        console.warn('Place search failed:', error);
        return of([]);
      })
    );
  }

  /** Search-as-you-type: debounced, skips repeated queries, cancels outdated requests. */
  searchAsYouType(queries: Observable<string>): Observable<GeocodingResult[]> {
    return queries.pipe(
      map((query) => query.trim()),
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((query) => this.search(query))
    );
  }

  private remember(key: string, results: GeocodingResult[]): void {
    if (this.cache.size >= CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, results);
  }
}
