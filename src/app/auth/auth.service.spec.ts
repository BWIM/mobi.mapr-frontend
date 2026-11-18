import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import {
  ACCESS_TOKEN_REFRESH_MARGIN_MS,
  ACCESS_TOKEN_RETRY_DELAY_MS,
  AuthService,
  getJwtExpiry,
  getRefreshDelay,
} from './auth.service';
import { ReturnUrlService } from './return-url.service';

const REFRESH_URL = `${environment.apiUrl}/token/refresh/`;
const HOUR_MS = 60 * 60 * 1000;

/** Unsigned test JWT whose payload carries `exp` (seconds). */
function jwt(expiresAtMs: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: Math.floor(expiresAtMs / 1000) })}.sig`;
}

describe('access token expiry helpers', () => {
  it('reads exp from a JWT in milliseconds', () => {
    const expiresAt = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(getJwtExpiry(jwt(expiresAt))).toBe(expiresAt);
  });

  it('returns null for tokens without a readable exp', () => {
    expect(getJwtExpiry(undefined)).toBeNull();
    expect(getJwtExpiry('not-a-jwt')).toBeNull();
    expect(getJwtExpiry('a.!!!.c')).toBeNull();
    expect(getRefreshDelay('not-a-jwt')).toBeNull();
  });

  it('schedules the refresh the margin before expiry, or now if that has passed', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(getRefreshDelay(jwt(now + 12 * HOUR_MS), now)).toBe(12 * HOUR_MS - ACCESS_TOKEN_REFRESH_MARGIN_MS);
    expect(getRefreshDelay(jwt(now + 60_000), now)).toBe(0);
    expect(getRefreshDelay(jwt(now - HOUR_MS), now)).toBe(0);
  });
});

describe('AuthService refresh scheduling', () => {
  let http: HttpTestingController;
  let redirectToLogin: jasmine.Spy;

  function storeSession(accessToken: string): void {
    localStorage.setItem('currentUser', JSON.stringify({ username: 'u', token: accessToken }));
    localStorage.setItem('refreshToken', 'refresh-1');
  }

  function createService(): AuthService {
    redirectToLogin = jasmine.createSpy('redirectToLogin').and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ReturnUrlService, useValue: { redirectToLogin } },
      ],
    });
    const service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    return service;
  }

  afterEach(() => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');
    http?.verify();
  });

  it('refreshes once, shortly before the stored token expires (no polling)', fakeAsync(() => {
    const token = jwt(Date.now() + 12 * HOUR_MS);
    storeSession(token);
    const service = createService();
    // exp has whole-second precision, so derive the expected delay from the decoded value.
    const expectedDelay = (getJwtExpiry(token) as number) - ACCESS_TOKEN_REFRESH_MARGIN_MS - Date.now();

    tick(expectedDelay - 1);
    http.expectNone(REFRESH_URL);

    tick(1);
    const req = http.expectOne(REFRESH_URL);
    expect(req.request.body).toEqual({ refresh: 'refresh-1' });
    const nextToken = jwt(Date.now() + 12 * HOUR_MS);
    req.flush({ access: nextToken, refresh: 'refresh-1' });

    expect(service.getAuthorizationHeaders().get('Authorization')).toBe(`Bearer ${nextToken}`);
    // The next refresh is scheduled from the new token's expiry.
    tick((getJwtExpiry(nextToken) as number) - ACCESS_TOKEN_REFRESH_MARGIN_MS - Date.now() - 1);
    http.expectNone(REFRESH_URL);

    service.logout();
  }));

  it('refreshes immediately when the stored token already expired', fakeAsync(() => {
    storeSession(jwt(Date.now() - HOUR_MS));
    const service = createService();
    tick(0);
    http.expectOne(REFRESH_URL).flush({ access: jwt(Date.now() + 12 * HOUR_MS), refresh: 'refresh-1' });
    expect(service.isLoggedIn()).toBeTrue();
    service.logout();
  }));

  it('refreshIfDue only refreshes within the margin', fakeAsync(() => {
    const token = jwt(Date.now() + 12 * HOUR_MS);
    const expiresAt = getJwtExpiry(token) as number;
    storeSession(token);
    const service = createService();

    service.refreshIfDue(expiresAt - ACCESS_TOKEN_REFRESH_MARGIN_MS - 1);
    http.expectNone(REFRESH_URL);

    service.refreshIfDue(expiresAt - 1000);
    http.expectOne(REFRESH_URL).flush({ access: jwt(Date.now() + 12 * HOUR_MS), refresh: 'refresh-1' });
    service.logout();
  }));

  it('logs out and redirects to login when the refresh token is rejected', fakeAsync(() => {
    storeSession(jwt(Date.now() - HOUR_MS));
    const service = createService();
    tick(0);
    http.expectOne(REFRESH_URL).flush({ detail: 'Token is invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.isLoggedIn()).toBeFalse();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(redirectToLogin).toHaveBeenCalled();

    tick(HOUR_MS);
    http.expectNone(REFRESH_URL);
  }));

  it('retries after a transient failure instead of logging out', fakeAsync(() => {
    spyOn(console, 'warn');
    storeSession(jwt(Date.now() - HOUR_MS));
    const service = createService();
    tick(0);
    http.expectOne(REFRESH_URL).error(new ProgressEvent('error'), { status: 0 });

    expect(service.isLoggedIn()).toBeTrue();
    expect(redirectToLogin).not.toHaveBeenCalled();

    tick(ACCESS_TOKEN_RETRY_DELAY_MS);
    http.expectOne(REFRESH_URL).flush({ access: jwt(Date.now() + 12 * HOUR_MS), refresh: 'refresh-1' });
    expect(service.isLoggedIn()).toBeTrue();
    service.logout();
  }));
});
