import { sanitizeReturnUrl } from './return-url.service';

describe('sanitizeReturnUrl', () => {
  it('accepts in-app paths with query params', () => {
    expect(sanitizeReturnUrl('/dashboard?project_id=1&map=7%2F49%2F9')).toBe('/dashboard?project_id=1&map=7%2F49%2F9');
    expect(sanitizeReturnUrl('/users-area')).toBe('/users-area');
  });

  it('rejects external and protocol-relative URLs', () => {
    expect(sanitizeReturnUrl('https://evil.example')).toBeNull();
    expect(sanitizeReturnUrl('//evil.example')).toBeNull();
    expect(sanitizeReturnUrl('/\\evil.example')).toBeNull();
    expect(sanitizeReturnUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects pages that would loop or make no sense after login', () => {
    expect(sanitizeReturnUrl('/login?returnUrl=%2Fdashboard')).toBeNull();
    expect(sanitizeReturnUrl('/landing')).toBeNull();
    expect(sanitizeReturnUrl('/')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(sanitizeReturnUrl(null)).toBeNull();
    expect(sanitizeReturnUrl(undefined)).toBeNull();
    expect(sanitizeReturnUrl(42)).toBeNull();
  });
});
