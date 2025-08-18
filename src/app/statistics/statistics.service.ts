import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { PaginatedResponse, MunicipalityScore, CountyScore, StateScore } from './statistics.interface';
import { ShareService } from '../share/share.service';

export interface ScoreEntry {
  name: string;
  score: number;
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

  constructor(private http: HttpClient, private shareService: ShareService) {}

  get visible(): boolean {
    return this._visible.value;
  }

  set visible(value: boolean) {
    if (this.shareService.getIsShare()) {
      return;
    }
    this._visible.next(value);
  }

  getMunicipalityScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<MunicipalityScore>> {
    return this.http.get<PaginatedResponse<MunicipalityScore>>(
      `${environment.apiUrl}/gemeinden-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
    );
  }

  getCountyScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<CountyScore>> {
    return this.http.get<PaginatedResponse<CountyScore>>(
      `${environment.apiUrl}/landkreis-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
    );
  }

  getStateScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<StateScore>> {
    return this.http.get<PaginatedResponse<StateScore>>(
      `${environment.apiUrl}/land-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
    );
  }

  convertToScoreEntry(data: MunicipalityScore | CountyScore | StateScore, level: 'state' | 'county' | 'municipality', rank: number): ScoreEntry {
    if ('gemeinde' in data) {
      return {
        name: data.gemeinde.name,
        score: data.score_pop,
        population: data.gemeinde.population,
        population_density: data.gemeinde.population_density,
        level: 'municipality',
        county: data.landkreis,
        rank: rank
      };
    } else if ('landkreis' in data) {
      return {
        name: data.landkreis.name,
        score: data.score_pop,
        population: data.landkreis.population,
        population_density: data.landkreis.population_density,
        level: 'county',
        rank: rank
      };
    } else {
      return {
        name: data.land.name,
        score: data.score_pop,
        population: data.land.population,
        population_density: data.land.population_density,
        level: 'state',
        rank: rank
      };
    }
  }
}
