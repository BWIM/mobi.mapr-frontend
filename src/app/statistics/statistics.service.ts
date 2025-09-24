import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { PaginatedResponse, MunicipalityScore, CountyScore, StateScore } from './statistics.interface';
import { ShareService } from '../share/share.service';

export interface ScoreEntry {
  name: string;
  score_pop: number;
  score_avg: number;
  index_pop: number;
  index_avg: number;
  level: 'state' | 'county' | 'municipality';
  population?: number;
  population_density?: number;
  county?: string;
  rank?: number;
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private _visible = new BehaviorSubject<boolean>(false);
  visible$ = this._visible.asObservable();

  constructor(private http: HttpClient, private shareService: ShareService) { }

  get visible(): boolean {
    return this._visible.value;
  }

  set visible(value: boolean) {
    this._visible.next(value);
  }

  getMunicipalityScores(projectId: string, type: 'avg' | 'pop' = 'pop', populationFilters?: { min: number, max: number }[], gemeindeId?: number): Observable<any> {
    let url = `${environment.apiUrl}/gemeinden-stats?project=${projectId}&type=${type}`;

    // Add population filters only if provided (meaning filters are active)
    if (populationFilters && populationFilters.length > 0) {
      const filterParams = populationFilters.map(filter =>
        `population_min=${filter.min}&population_max=${filter.max}`
      ).join('&');
      url += `&${filterParams}`;
    }

    // Add gemeinde ID filter if provided
    if (gemeindeId) {
      url += `&gemeinde_id=${gemeindeId}`;
    }

    if (this.shareService.getIsShare()) {
      const shareKey = this.shareService.getShareKey();
      url += `&key=${shareKey}`;
    }

    console.log('API URL for municipality scores:', url);
    return this.http.get<any>(url);
  }

  getGemeindeNames(projectId: string): Observable<{ [key: string]: number }> {
    let url = `${environment.apiUrl}/gemeinde-names?project=${projectId}`;

    if (this.shareService.getIsShare()) {
      const shareKey = this.shareService.getShareKey();
      url += `&key=${shareKey}`;
    }

    return this.http.get<{ [key: string]: number }>(url);
  }

  getCountyScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<CountyScore>> {
    if (this.shareService.getIsShare()) {
      const shareKey = this.shareService.getShareKey();
      return this.http.get<PaginatedResponse<CountyScore>>(
        `${environment.apiUrl}/landkreis-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}&key=${shareKey}`
      );
    } else {
      return this.http.get<PaginatedResponse<CountyScore>>(
        `${environment.apiUrl}/landkreis-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
      );
    }
  }

  getStateScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<StateScore>> {
    if (this.shareService.getIsShare()) {
      const shareKey = this.shareService.getShareKey();
      return this.http.get<PaginatedResponse<StateScore>>(
        `${environment.apiUrl}/land-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}&key=${shareKey}`
      );
    } else {
      return this.http.get<PaginatedResponse<StateScore>>(
        `${environment.apiUrl}/land-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
      );
    }
  }

  convertToScoreEntry(data: MunicipalityScore | CountyScore | StateScore, level: 'state' | 'county' | 'municipality', rank?: number): ScoreEntry {
    // Use API-provided rank if available, otherwise use the passed rank parameter
    const finalRank = data.rank || rank || 1;

    if ('gemeinde_id' in data) {
      // New structure for MunicipalityScore
      return {
        name: data.name,
        score_pop: data.score_pop || 0,
        score_avg: data.score_avg || 0,
        index_pop: data.index_pop,
        index_avg: data.index_avg || 0,
        population: 0, // Not available in new structure
        population_density: 0, // Not available in new structure
        level: 'municipality',
        county: data.landkreis_name,
        rank: finalRank,
      };
    } else if ('landkreis' in data) {
      return {
        name: data.landkreis.name,
        score_pop: data.score_pop,
        score_avg: data.score_avg,
        index_pop: data.index_pop,
        index_avg: data.index_avg,
        population: data.landkreis.population,
        population_density: data.landkreis.population_density,
        level: 'county',
        rank: finalRank
      };
    } else {
      return {
        name: data.land.name,
        score_pop: data.score_pop,
        score_avg: data.score_avg,
        index_pop: data.index_pop,
        index_avg: data.index_avg,
        population: data.land.population,
        population_density: data.land.population_density,
        level: 'state',
        rank: finalRank
      };
    }
  }
}
