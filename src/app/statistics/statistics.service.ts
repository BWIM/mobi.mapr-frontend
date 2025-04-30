import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MapBuildService } from '../map/map-build.service';
import Feature from 'ol/Feature';
import { Geometry } from 'ol/geom';

export interface ScoreEntry {
  name: string;
  score: number;
  population: number;
  level: 'state' | 'county' | 'municipality';
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private _visible = new BehaviorSubject<boolean>(false);
  visible$ = this._visible.asObservable();

  constructor(private mapBuildService: MapBuildService) { }

  get visible(): boolean {
    return this._visible.value;
  }

  set visible(value: boolean) {
    this._visible.next(value);
    if (!value) {
      // Clear municipalities cache when closing statistics view
      this.mapBuildService.clearMunicipalitiesCache();
    }
  }

  async loadAllMunicipalities(): Promise<void> {
    const counties = Object.keys(this.mapBuildService.getCache().counties);
    if (counties.length > 0) {
      const features: Feature<Geometry>[] = counties.map(id => {
        const feature = new Feature();
        feature.setProperties({ ars: id.substring(0, 5) + '0000000' });
        return feature;
      });
      await this.mapBuildService.buildMap(this.mapBuildService.getLandkreise(), 'municipality', features);
    }
  }

  async getTopScores(level: 'state' | 'county' | 'municipality'): Promise<ScoreEntry[]> {
    let features: any[] = [];
    
    switch(level) {
      case 'state':
        features = Object.values(this.mapBuildService.getCache().states);
        break;
      case 'county':
        features = Object.values(this.mapBuildService.getCache().counties);
        break;
      case 'municipality':
        // Get all counties from the cache
        const counties = Object.keys(this.mapBuildService.getCache().counties);
        if (counties.length > 0) {
          // Check if we have municipalities loaded for each county
          const municipalitiesInCache = Object.keys(this.mapBuildService.getCache().municipalities);
          if (municipalitiesInCache.length < counties.length) {
            await this.loadAllMunicipalities();
          }
          features = Object.values(this.mapBuildService.getCache().municipalities)
            .flatMap(municipalityGroup => Object.values(municipalityGroup));
        }
        break;
    }

    const scores = features
      .map(feature => ({
        name: feature.properties.name,
        score: feature.properties.score,
        population: feature.properties.population,
        level
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    return scores;
  }
}
