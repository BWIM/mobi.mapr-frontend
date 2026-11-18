import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { TILE_TOKEN_RENEW_MARGIN_MS, TileTokenService } from './tile-token.service';

const TOKEN_URL = `${environment.apiUrl}/tiles/token/`;
const HOUR_S = 3600;

describe('TileTokenService', () => {
  let service: TileTokenService;
  let http: HttpTestingController;
  let currentUser: BehaviorSubject<unknown>;

  beforeEach(() => {
    currentUser = new BehaviorSubject<unknown>({ token: 'jwt' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser$: currentUser.asObservable(),
            isLoggedIn: () => !!currentUser.value,
          },
        },
      ],
    });
    service = TestBed.inject(TileTokenService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.clear();
    http.verify();
  });

  function answer(tt: string, expiresIn = HOUR_S): void {
    const req = http.expectOne(TOKEN_URL);
    req.flush({ tt, expires_in: expiresIn });
  }

  it('fetches a token per project and reuses it while valid', fakeAsync(() => {
    let first: string | null = null;
    service.ensure(7).then((tt) => (first = tt));
    const req = http.expectOne(TOKEN_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ project_id: 7 });
    req.flush({ tt: 'tt-7', expires_in: HOUR_S });
    flushMicrotasks();

    expect(first as string | null).toBe('tt-7');
    expect(service.current(7)).toBe('tt-7');
    expect(service.current(8)).toBeNull();

    let second: string | null = null;
    service.ensure(7).then((tt) => (second = tt));
    flushMicrotasks();
    http.expectNone(TOKEN_URL);
    expect(second as string | null).toBe('tt-7');
    service.clear(); // fakeAsync would otherwise flush the pending renew timer
  }));

  it('shares one request between concurrent callers', fakeAsync(() => {
    const results: Array<string | null> = [];
    service.ensure(7).then((tt) => results.push(tt));
    service.ensure(7).then((tt) => results.push(tt));
    answer('tt-7');
    flushMicrotasks();
    expect(results).toEqual(['tt-7', 'tt-7']);
    service.clear();
  }));

  it('requests a new token when the project changes', fakeAsync(() => {
    service.ensure(7);
    answer('tt-7');
    flushMicrotasks();

    service.ensure(8);
    const req = http.expectOne(TOKEN_URL);
    expect(req.request.body).toEqual({ project_id: 8 });
    req.flush({ tt: 'tt-8', expires_in: HOUR_S });
    flushMicrotasks();

    expect(service.current(8)).toBe('tt-8');
    expect(service.current(7)).toBeNull();
    service.clear();
  }));

  it('renews the token shortly before it expires', fakeAsync(() => {
    service.ensure(7);
    answer('tt-old');
    flushMicrotasks();

    tick(HOUR_S * 1000 - TILE_TOKEN_RENEW_MARGIN_MS - 1);
    http.expectNone(TOKEN_URL);
    expect(service.current(7)).toBe('tt-old');

    tick(1);
    answer('tt-new');
    flushMicrotasks();
    expect(service.current(7)).toBe('tt-new');

    service.clear();
  }));

  it('reports a renewal after the old token had already expired', fakeAsync(() => {
    let renewedAfterExpiry = 0;
    service.renewedAfterExpiry.subscribe(() => renewedAfterExpiry++);

    service.ensure(7);
    answer('tt-old', 60);
    flushMicrotasks();
    service.clear();
    // Simulate the old token outliving its expiry (e.g. a suspended device).
    service.ensure(7);
    answer('tt-again', 60);
    flushMicrotasks();
    expect(renewedAfterExpiry).toBe(0);

    tick(61_000);
    // The renew timer fired at 0 ms (margin > lifetime) and is pending.
    answer('tt-new');
    flushMicrotasks();
    expect(renewedAfterExpiry).toBe(1);
    expect(service.current(7)).toBe('tt-new');
    service.clear();
  }));

  it('drops the token on logout', fakeAsync(() => {
    service.ensure(7);
    answer('tt-7');
    flushMicrotasks();

    currentUser.next(null);
    expect(service.current(7)).toBeNull();

    tick(HOUR_S * 1000);
    http.expectNone(TOKEN_URL);
  }));

  it('returns null when the token request fails', fakeAsync(() => {
    spyOn(console, 'warn');
    let result: string | null = 'unset';
    service.ensure(7).then((tt) => (result = tt));
    http.expectOne(TOKEN_URL).flush('no access', { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();
    expect(result as string | null).toBeNull();
    expect(service.current(7)).toBeNull();
  }));
});
