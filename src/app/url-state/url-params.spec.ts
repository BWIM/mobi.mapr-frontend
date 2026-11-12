import {
  DashboardUrlState,
  PROJECT_SCOPED_PARAMS,
  URL_PARAM,
  VIEW_STATE_PARAMS,
  featureRefFromFeature,
  formatViewport,
  hasViewStateParams,
  parseDashboardUrlState,
  parseFeatureRef,
  parseIdList,
  parseViewport,
  serializeDashboardUrlState,
  shareDefaultViewQueryParams,
  shareDefaultViewToParams,
} from './url-params';

/** Serialised params without the `null` (= remove) entries. */
function present(state: DashboardUrlState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(serializeDashboardUrlState(state)).filter(([, value]) => value !== null)
  ) as Record<string, string>;
}

describe('url-params', () => {
  describe('round trip', () => {
    it('restores a full state from its serialised form', () => {
      const state: DashboardUrlState = {
        lang: 'en',
        viewport: { zoom: 9.5, lat: 49.3201, lng: 9.2157 },
        bewertung: 'zeit',
        profileIds: [1, 3],
        compareProfileIds: [2],
        diff: true,
        layer: 'hexagon',
        qualityBrackets: ['A', 'C'],
        timeBrackets: ['t1', 't2'],
        regiostarIds: [11, 12],
        stateIds: [8],
        statsLevel: 'municipality',
        feature: { type: 'm', id: 8111000 },
        featureSide: 'right',
        feature2: { type: 'm', id: 8212000 },
      };

      expect(parseDashboardUrlState(present(state))).toEqual(state);
    });

    it('keeps an empty bracket selection distinct from "all"', () => {
      const state: DashboardUrlState = { qualityBrackets: [], timeBrackets: [] };
      const params = present(state);

      expect(params[URL_PARAM.qualityBrackets]).toBe('none');
      expect(parseDashboardUrlState(params)).toEqual(state);
    });

    it('serialises id lists sorted and without duplicates', () => {
      expect(present({ profileIds: [3, 1, 3] })[URL_PARAM.profileIds]).toBe('1,3');
    });
  });

  describe('serializeDashboardUrlState', () => {
    it('returns null for every view param that is not set, so merges remove them', () => {
      const params = serializeDashboardUrlState({});
      for (const name of VIEW_STATE_PARAMS) {
        expect(params[name]).withContext(name).toBeNull();
      }
    });

    it('drops diff without compare view and side/second feature without a feature', () => {
      const params = present({ diff: true, featureSide: 'right', feature2: { type: 'm', id: 1 } });
      expect(params).toEqual({});
    });

    it('writes the left side implicitly', () => {
      const params = present({ feature: { type: 'h', id: 5 }, featureSide: 'left' });
      expect(params).toEqual({ [URL_PARAM.feature]: 'h:5' });
    });
  });

  describe('parseDashboardUrlState', () => {
    it('ignores invalid values', () => {
      expect(
        parseDashboardUrlState({
          lang: 'not a lang',
          map: 'abc',
          bewertung: 'other',
          profile_ids: 'x,y',
          layer: 'country',
          stats_level: 'hexagon',
          feature: 'x:1',
          diff: 'maybe',
        })
      ).toEqual({});
    });

    it('reads the legacy legend_brackets param', () => {
      expect(parseDashboardUrlState({ legend_brackets: 'A,B,t3' })).toEqual({
        qualityBrackets: ['A', 'B'],
        timeBrackets: ['t3'],
      });
    });

    it('prefers the new bracket params over legend_brackets', () => {
      expect(parseDashboardUrlState({ legend_brackets: 'A', quality_brackets: 'F' })).toEqual({
        qualityBrackets: ['F'],
      });
    });

    it('ignores feature_side and feature2 without a primary feature', () => {
      expect(parseDashboardUrlState({ feature_side: 'right', feature2: 'm:2' })).toEqual({});
    });

    it('drops feature2 when it equals the primary feature', () => {
      expect(parseDashboardUrlState({ feature: 'm:2', feature2: 'm:2' })).toEqual({
        feature: { type: 'm', id: 2 },
      });
    });

    it('takes the first value of repeated params', () => {
      expect(parseDashboardUrlState({ bewertung: ['zeit', 'qualitaet'] })).toEqual({ bewertung: 'zeit' });
    });
  });

  describe('value codecs', () => {
    it('parses id lists', () => {
      expect(parseIdList('1, 2,2,abc,-3')).toEqual([1, 2]);
      expect(parseIdList('')).toBeUndefined();
      expect(parseIdList(undefined)).toBeUndefined();
    });

    it('parses and rounds viewports', () => {
      expect(parseViewport('7/49.3/9.2')).toEqual({ zoom: 7, lat: 49.3, lng: 9.2 });
      expect(parseViewport('7/91/9.2')).toBeUndefined();
      expect(parseViewport('7/49.3')).toBeUndefined();
      expect(formatViewport({ zoom: 7.123456, lat: 49.1234567, lng: 9.7654321 })).toBe('7.12/49.12346/9.76543');
    });

    it('parses feature refs', () => {
      expect(parseFeatureRef('c:8111')).toEqual({ type: 'c', id: 8111 });
      expect(parseFeatureRef('c:0')).toBeUndefined();
      expect(parseFeatureRef('c:1.5')).toBeUndefined();
    });

    it('builds feature refs from map features', () => {
      expect(featureRefFromFeature({ id: 3, properties: { t: 's' } })).toEqual({ type: 's', id: 3 });
      expect(featureRefFromFeature({ properties: { t: 'm', id: '42' } })).toEqual({ type: 'm', id: 42 });
      expect(featureRefFromFeature({ id: 3, properties: {} })).toBeUndefined();
      expect(featureRefFromFeature(null)).toBeUndefined();
    });
  });

  it('only marks project-specific params as project scoped', () => {
    expect(PROJECT_SCOPED_PARAMS).not.toContain(URL_PARAM.viewport);
    expect(PROJECT_SCOPED_PARAMS).not.toContain(URL_PARAM.lang);
    expect(PROJECT_SCOPED_PARAMS).not.toContain(URL_PARAM.bewertung);
    expect(PROJECT_SCOPED_PARAMS).toContain(URL_PARAM.feature);
  });

  describe('share default view', () => {
    it('detects view params next to access params', () => {
      expect(hasViewStateParams({ share_key: 'abc', project_id: '5', overview: 'true' })).toBeFalse();
      expect(hasViewStateParams({ share_key: 'abc', map: '7/49/9' })).toBeTrue();
      expect(hasViewStateParams({ share_key: 'abc', legend_brackets: 'A' })).toBeTrue();
      expect(hasViewStateParams({ share_key: 'abc', diff: '' })).toBeFalse();
    });

    it('converts typed default view values into URL params', () => {
      expect(
        shareDefaultViewToParams({
          lang: 'en',
          profile_ids: [3, 1],
          compare_profile_ids: [2],
          diff: true,
          quality_brackets: [],
          regiostar_ids: [],
          unknown: 'x',
          bewertung: 42,
        })
      ).toEqual({
        lang: 'en',
        profile_ids: '3,1',
        compare_profile_ids: '2',
        diff: '1',
        quality_brackets: 'none',
      });
      expect(shareDefaultViewToParams({ diff: false })).toEqual({ diff: '0' });
      expect(shareDefaultViewToParams(null)).toEqual({});
    });

    it('builds validated, normalised query params', () => {
      expect(
        shareDefaultViewQueryParams({
          map: '9.5/49.3201/9.2157',
          bewertung: 'zeit',
          profile_ids: [3, 1],
          compare_profile_ids: [2],
          diff: true,
          layer: 'county',
          state_ids: [8],
          stats_level: 'municipality',
          feature: 'm:8111000',
        })
      ).toEqual({
        map: '9.5/49.3201/9.2157',
        bewertung: 'zeit',
        profile_ids: '1,3',
        compare_profile_ids: '2',
        diff: '1',
        layer: 'county',
        state_ids: '8',
        stats_level: 'municipality',
        feature: 'm:8111000',
      });
    });

    it('drops invalid values and a diff without compare view', () => {
      expect(
        shareDefaultViewQueryParams({ layer: 'planet', bewertung: 'x', diff: true, map: 'nope' })
      ).toEqual({});
      expect(shareDefaultViewQueryParams({})).toEqual({});
      expect(shareDefaultViewQueryParams(undefined)).toEqual({});
    });
  });
});
