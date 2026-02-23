import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, TemplateRef } from '@angular/core';
import { Subscription, firstValueFrom, debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Map, NavigationControl, FullscreenControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapService } from '../../services/map.service';
import MinimapControl from "maplibregl-minimap";
import { SharedModule } from '../../shared/shared.module';
import { FilterConfigService } from '../../services/filter-config.service';
import { MatDialog } from '@angular/material/dialog';
import { InfoDialogComponent } from '../../shared/info-overlay/info-dialog.component';
import { HttpClient, HttpParams } from '@angular/common/http';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

@Component({
  selector: 'app-center',
  imports: [SharedModule],
  templateUrl: './center.component.html',
  styleUrl: './center.component.css',
})
export class CenterComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer?: ElementRef;
  @ViewChild('legendContentTemplate') legendContentTemplate!: TemplateRef<any>;
  private map?: Map;
  private mapStyleSubscription?: Subscription;
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  private filterConfigService = inject(FilterConfigService);
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);

  // Nominatim search properties
  searchQuery: string = '';
  searchResults: NominatimResult[] = [];
  private searchSubject = new Subject<string>();
  isGettingLocation: boolean = false;

  constructor(private mapService: MapService) {
    // Setup debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.searchNominatim(query))
    ).subscribe(results => {
      this.searchResults = results;
    });
  }

  get isMapLoading() {
    return this.mapService.isMapLoading;
  }

  get selectedBewertung() {
    return this.filterConfigService.selectedBewertung;
  }

  get isQualityMode() {
    return this.selectedBewertung() === 'qualitaet';
  }


  // Quality (index) colors - A through F
  qualityColors = [
    { letter: 'A', color: 'rgba(50, 97, 45, 0.7)' },
    { letter: 'B', color: 'rgba(60, 176, 67, 0.7)' },
    { letter: 'C', color: 'rgba(238, 210, 2, 0.7)' },
    { letter: 'D', color: 'rgba(237, 112, 20, 0.7)' },
    { letter: 'E', color: 'rgba(194, 24, 7, 0.7)' },
    { letter: 'F', color: 'rgba(150, 86, 162, 0.7)' }
  ];

  // Time (score) colors - gradient stops
  timeColors = [
    { value: '< 10', color: 'rgb(204, 232, 230)' },
    { value: '10', color: 'rgb(153, 211, 206)' },
    { value: '20', color: 'rgb(102, 190, 181)' },
    { value: '30', color: 'rgb(51, 170, 156)' },
    { value: '40', color: 'rgb(0, 150, 131)' },
    { value: '50', color: 'rgb(0, 121, 107)' },
    { value: '60+', color: 'rgb(0, 96, 85)' }
  ];

  getTimeGradient(): string {
    return `linear-gradient(to right, 
      rgb(181, 212, 233) 0%, 
      rgb(147, 195, 224) 16.67%, 
      rgb(109, 173, 213) 33.33%, 
      rgb(75, 151, 201) 50%, 
      rgb(48, 126, 188) 66.67%, 
      rgb(24, 100, 170) 83.33%, 
      rgb(24, 100, 170) 100%)`;
  }

  openLegendDialog(): void {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
      panelClass: 'info-dialog-panel',
      data: { content: this.legendContentTemplate }
    });
  }

  async ngOnInit() {
    // Get initial style value immediately
    this.mapStyle = await firstValueFrom(this.mapService.mapStyle$);

    // Subscribe to map style changes
    this.mapStyleSubscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.map) {
        this.map.setStyle(style);
      }
    });
  }

  ngAfterViewInit() {
    if (this.mapContainer) {
      const mapOptions: any = {
        container: this.mapContainer.nativeElement,
        style: this.mapStyle,
        center: this.center,
        zoom: this.zoom,
        minZoom: 5,
        maxZoom: 12,
        dragRotate: false,
        renderWorldCopies: false,
        attributionControl: false
      };

      this.map = new Map(mapOptions);
      this.mapService.setMap(this.map);

      // Add navigation controls
      this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      this.map.addControl(new FullscreenControl(), 'top-right');
      this.map.dragRotate.disable();
      this.map.touchZoomRotate.disableRotation();

      // Wait for map to load before adding minimap to avoid initialization errors
      this.map.once('load', () => {
        if (this.map) {
          this.map.addControl(new MinimapControl(this.mapService.getMinimapConfig()), 'bottom-right');
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
    if (this.mapStyleSubscription) {
      this.mapStyleSubscription.unsubscribe();
    }
    this.searchSubject.complete();
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();
    
    if (query.length >= 3) {
      this.searchSubject.next(query);
    } else {
      this.searchResults = [];
    }
  }

  onSearchSubmit(): void {
    if (this.searchQuery.trim().length >= 3) {
      this.searchSubject.next(this.searchQuery.trim());
    }
  }

  private searchNominatim(query: string): Promise<NominatimResult[]> {
    if (!query || query.length < 3) {
      return Promise.resolve([]);
    }

    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('limit', '10')
      .set('addressdetails', '1');

    // Nominatim requires a User-Agent header per their usage policy
    const headers = {
      'User-Agent': 'MapR-Frontend/1.0'
    };

    return firstValueFrom(
      this.http.get<NominatimResult[]>(`https://nominatim.openstreetmap.org/search`, { params, headers })
    ).catch(error => {
      console.error('Nominatim search error:', error);
      return [];
    });
  }

  onLocationSelected(event: any): void {
    const result: NominatimResult = event.option.value;
    this.zoomToLocation(parseFloat(result.lat), parseFloat(result.lon));
    this.searchQuery = result.display_name;
    this.searchResults = [];
  }

  private zoomToLocation(lat: number, lon: number): void {
    if (!this.map) {
      return;
    }

    this.map.flyTo({
      center: [lon, lat],
      zoom: 12,
      duration: 1500
    });
  }
}
