import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';
import { LoadingService } from '../services/loading.service';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { StyleSpecification, SourceSpecification, LayerSpecification, Map } from 'maplibre-gl';
import { AnalyzeService } from '../analyze/analyze.service';

interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapV2Service {
  private currentProject: string | null = null;
  private currentZoom: number = 7;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$ = this.mapStyleSubject.asObservable();
  averageType: 'avg' | 'pop' = 'pop';
  private boundsSubject = new BehaviorSubject<Bounds | null>(null);
  bounds$ = this.boundsSubject.asObservable();
  private map: Map | null = null;
  private shareKey: string | null = null;

  constructor(
    private loadingService: LoadingService,
    private http: HttpClient,
    private authService: AuthService,
    private analyzeService: AnalyzeService
  ) { }

  setMap(map: Map): void {
    this.map = map;
  }

  getMap(): Map | null {
    return this.map;
  }

  getCurrentProject(): string | null {
    return this.currentProject;
  }

  getMainLayer(): any {
    if (!this.map) return null;
    return this.map.getLayer('geodata-fill');
  }

  getBaseMapStyle(): StyleSpecification {
    return {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
          tileSize: 256,
        } as SourceSpecification
      },
      layers: [
        {
          id: 'carto-light-layer',
          type: 'raster',
          source: 'carto-light',
          minzoom: 0,
          maxzoom: 19
        } as LayerSpecification
      ]
    };
  }

  resetMap(): void {
    this.map = null;
    this.shareKey = null;
    this.mapStyleSubject.next(this.getBaseMapStyle());
  }

  setProject(projectId: string, shareKey?: string): void {
    this.currentProject = projectId;
    this.shareKey = shareKey || null;
    this.loadingService.startLoading();

    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    let authParam = '';
    if (this.shareKey) {
      authParam = `&key=${this.shareKey}`;
    } else if (token) {
      authParam = `&token=${token}`;
    }
    
    this.http.get<Bounds>(`${environment.apiUrl}/bounds?project=${projectId}${authParam}`).subscribe(
      bounds => {
        this.boundsSubject.next(bounds);
        const updatedStyle = this.getProjectMapStyle();
        this.mapStyleSubject.next(updatedStyle);
      },
      error => {
        console.error('Error fetching bounds:', error);
        this.loadingService.stopLoading();
      }
    );
  }

  setAverageType(averageType: 'avg' | 'pop'): void {
    this.averageType = averageType;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle();
      this.mapStyleSubject.next(updatedStyle);
    }
  }

  updateZoom(zoom: number): void {
    this.currentZoom = zoom;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle();
      this.mapStyleSubject.next(updatedStyle);
    }
  }

  private getTileUrl(): string {
    if (!this.currentProject) return '';
    
    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    let authParam = '';
    if (this.shareKey) {
      authParam = `&key=${this.shareKey}`;
    } else if (token) {
      authParam = `&token=${token}`;
    }
    
    // Define zoom level thresholds
    if (this.currentZoom < 7) {
      // State level
      this.analyzeService.setMapType('state');
      return `${environment.apiUrl}/tiles/laender/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${this.currentProject}${authParam}`;
    } else if (this.currentZoom < 8) {
      // County level
      this.analyzeService.setMapType('county');
      return `${environment.apiUrl}/tiles/landkreise/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${this.currentProject}${authParam}`;
    } else if (this.currentZoom < 9) {
      // Municipality level
      this.analyzeService.setMapType('municipality');
      return `${environment.apiUrl}/tiles/gemeinden/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${this.currentProject}${authParam}`;
    } else if (this.currentZoom < 10) {
      this.analyzeService.setMapType('hexagon');
      return `${environment.apiUrl}/tiles/hexagons/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${this.currentProject}&resolution=8${authParam}`;
    } else {
      this.analyzeService.setMapType('hexagon');
      return `${environment.apiUrl}/tiles/hexagons/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${this.currentProject}&resolution=9${authParam}`;
    }
  }

  private getProjectMapStyle(): StyleSpecification {
    const baseStyle = this.getBaseMapStyle();
    
    if (this.currentProject) {
      const tileUrl = this.getTileUrl();
      
      baseStyle.sources['geodata'] = {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 14,
        tileSize: 512
      } as SourceSpecification;

      baseStyle.layers.push({
        id: 'geodata-fill',
        type: 'fill',
        source: 'geodata',
        'source-layer': 'geodata',
        paint: {
          'fill-color': [
            'case',
            ['<=', ['get', 'score'], 0],
            'rgba(128, 128, 128, 0)',
            ['<=', ['get', 'score'], 0.35],
            'rgba(50, 97, 45, 0.7)',
            ['<=', ['get', 'score'], 0.5],
            'rgba(60, 176, 67, 0.7)',
            ['<=', ['get', 'score'], 0.71],
            'rgba(238, 210, 2, 0.7)',
            ['<=', ['get', 'score'], 1],
            'rgba(237, 112, 20, 0.7)',
            ['<=', ['get', 'score'], 1.41],
            'rgba(194, 24, 7, 0.7)',
            'rgba(150, 86, 162, 0.7)'
          ],
          'fill-opacity': [
            'interpolate',
            ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
            ['get', 'population_density'],
            0, 0.2,
            100, 0.5,
            1000, 0.8,
            5000, 0.9
          ]
        }
      } as LayerSpecification);
    }

    return baseStyle;
  }

  addSingleFeature(scores: any): void {
    console.log(scores);
  }
}
