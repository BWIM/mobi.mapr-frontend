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

  getMunicipalityScores(projectId: string, offset: number = 0, limit: number = 200, type: 'avg' | 'pop' = 'pop'): Observable<PaginatedResponse<MunicipalityScore>> {
    if (this.shareService.getIsShare()) {
      const shareKey = this.shareService.getShareKey();
      return this.http.get<PaginatedResponse<MunicipalityScore>>(
        `${environment.apiUrl}/gemeinden-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}&key=${shareKey}`
      );
    } else {
      return this.http.get<PaginatedResponse<MunicipalityScore>>(
        `${environment.apiUrl}/gemeinden-stats?project=${projectId}&offset=${offset}&limit=${limit}&type=${type}`
      );

    }
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

  convertToScoreEntry(data: MunicipalityScore | CountyScore | StateScore, level: 'state' | 'county' | 'municipality', rank: number): ScoreEntry {
    if ('gemeinde' in data) {
      return {
        name: data.gemeinde.name,
        score_pop: data.score_pop,
        score_avg: data.score_avg,
        index_pop: data.index_pop,
        index_avg: data.index_avg,
        population: data.gemeinde.population,
        population_density: data.gemeinde.population_density,
        level: 'municipality',
        county: data.landkreis,
        rank: rank,
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
        rank: rank
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
        rank: rank
      };
    }
  }
}
