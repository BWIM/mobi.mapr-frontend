import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  GeocodingResult,
  GeocodingService,
  buildPhotonLabel,
  mapPhotonResponse,
} from './geocoding.service';

const PHOTON_URL = `${environment.photonUrl}/api/`;

function feature(properties: Record<string, string>, coordinates: unknown = [13.4, 52.5]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties };
}

describe('Photon response mapping', () => {
  it('builds labels from name, street + number, postcode, city and state', () => {
    expect(buildPhotonLabel({
      name: 'Rathaus',
      street: 'Hauptstraße',
      housenumber: '5',
      postcode: '04109',
      city: 'Leipzig',
      state: 'Sachsen',
    })).toBe('Rathaus, Hauptstraße 5, 04109, Leipzig, Sachsen');
  });

  it('skips empty parts and duplicates', () => {
    // City result: name and state repeat ("Berlin, Berlin")
    expect(buildPhotonLabel({ name: 'Berlin', city: 'Berlin', state: 'Berlin', postcode: ' ' })).toBe('Berlin');
    expect(buildPhotonLabel({ street: 'Hauptstraße', city: 'Leipzig', state: 'Sachsen' }))
      .toBe('Hauptstraße, Leipzig, Sachsen');
    expect(buildPhotonLabel({ postcode: '10115', city: 'Berlin', state: 'Berlin' })).toBe('10115, Berlin');
    expect(buildPhotonLabel(undefined)).toBe('');
  });

  it('reads [lon, lat] coordinates', () => {
    const [result] = mapPhotonResponse({
      features: [feature({ name: 'Leipzig', countrycode: 'DE' }, [12.37, 51.34])],
    });
    expect(result).toEqual({ label: 'Leipzig', lat: 51.34, lon: 12.37 });
  });

  it('keeps only German results', () => {
    const results = mapPhotonResponse({
      features: [
        feature({ name: 'Aachen', countrycode: 'DE' }),
        feature({ name: 'Maastricht', countrycode: 'NL' }),
        feature({ name: 'Basel', countrycode: 'CH' }),
        feature({ name: 'Kehl', countrycode: 'de' }),
        feature({ name: 'Unknown' }),
      ],
    });
    expect(results.map((r) => r.label)).toEqual(['Aachen', 'Kehl']);
  });

  it('shows one entry per label (street segments)', () => {
    const segment = { name: 'An der Hauptstraße', postcode: '04356', city: 'Leipzig', state: 'Sachsen', countrycode: 'DE' };
    const results = mapPhotonResponse({
      features: [feature(segment, [12.4448, 51.4198]), feature(segment, [12.4451, 51.4193])],
    });
    expect(results).toEqual([{ label: 'An der Hauptstraße, 04356, Leipzig, Sachsen', lat: 51.4198, lon: 12.4448 }]);
  });

  it('drops features without usable coordinates or label', () => {
    const results = mapPhotonResponse({
      features: [
        feature({ name: 'No coords', countrycode: 'DE' }, null),
        feature({ name: 'Bad coords', countrycode: 'DE' }, ['x', 'y']),
        feature({ countrycode: 'DE' }),
      ],
    });
    expect(results).toEqual([]);
    expect(mapPhotonResponse(null)).toEqual([]);
  });
});

describe('GeocodingService', () => {
  let service: GeocodingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GeocodingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('queries Photon limited to Germany and caches the result', () => {
    let first: GeocodingResult[] = [];
    service.search('  Berlin ').subscribe((results) => (first = results));
    const req = http.expectOne((r) => r.url === PHOTON_URL);
    expect(req.request.params.get('q')).toBe('Berlin');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.get('lang')).toBe('de');
    expect(req.request.params.get('bbox')).toBe('5.8,47.2,15.1,55.1');
    expect(req.request.headers.has('User-Agent')).toBeFalse();
    req.flush({ features: [feature({ name: 'Berlin', countrycode: 'DE' })] });
    expect(first.map((r) => r.label)).toEqual(['Berlin']);

    let second: GeocodingResult[] = [];
    service.search('berlin').subscribe((results) => (second = results));
    http.expectNone((r) => r.url === PHOTON_URL);
    expect(second).toEqual(first);
  });

  it('does not query for short input and returns [] on errors', () => {
    spyOn(console, 'warn');
    let short: GeocodingResult[] | null = null;
    service.search('Be').subscribe((results) => (short = results));
    http.expectNone((r) => r.url === PHOTON_URL);
    expect(short as GeocodingResult[] | null).toEqual([]);

    let failed: GeocodingResult[] | null = null;
    service.search('Hamburg').subscribe((results) => (failed = results));
    http.expectOne((r) => r.url === PHOTON_URL).flush('busy', { status: 429, statusText: 'Too Many Requests' });
    expect(failed as GeocodingResult[] | null).toEqual([]);
  });

  it('debounces search-as-you-type and searches a retyped query again', fakeAsync(() => {
    const queries = new Subject<string>();
    const emitted: GeocodingResult[][] = [];
    service.searchAsYouType(queries).subscribe((results) => emitted.push(results));

    queries.next('Ber');
    queries.next('Berl');
    tick(300);
    http.expectOne((r) => r.params.get('q') === 'Berl').flush({ features: [] });

    queries.next('Be');   // too short: empty result, no request
    tick(300);
    queries.next('Berl'); // retyped: emitted again (served from the cache)
    tick(300);
    http.expectNone((r) => r.url === PHOTON_URL);
    expect(emitted.length).toBe(3);
  }));
});
