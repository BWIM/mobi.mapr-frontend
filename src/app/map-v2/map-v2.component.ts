import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapV2Service } from './map-v2.service';
import { Subscription } from 'rxjs';
import { LngLatBounds, Map, Popup, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnalyzeService } from '../analyze/analyze.service';
import { LoadingService } from '../services/loading.service';
import { LegendComponent } from '../legend/legend.component';
import { Project, ProjectInfo } from '../projects/project.interface';
import { IndexService } from '../services/index.service';
import { ProjectsService } from '../projects/projects.service';
import { TranslateService } from '@ngx-translate/core';

// @ts-ignore
import MaplibreCompare from '@maplibre/maplibre-gl-compare';

@Component({
  selector: 'app-map-v2',
  templateUrl: './map-v2.component.html',
  styleUrl: './map-v2.component.css',
  imports: [CommonModule, LegendComponent],
  standalone: true
})
export class MapV2Component implements OnInit, OnDestroy, AfterViewInit {
  private map?: Map;
  private popup?: Popup;
  @ViewChild('mapContainer') mapContainer?: ElementRef;
  @ViewChild('comparisonContainer') comparisonContainer?: ElementRef;
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  private subscription: Subscription;
  private boundsSubscription: Subscription;
  private comparisonSubscription: Subscription;
  private stopComparisonSubscription: Subscription;
  private projectDataSubscription: Subscription;
  private locationSubscription: Subscription;
  private projectInfoSubscription: Subscription;
  private isComparison: boolean = false;
  projectName: string | null = null;
  comparisonProject: Project | null = null;
  currentProject: string | null = null;
  currentProjectData: Project | null = null;
  currentProjectInfo: ProjectInfo | null = null;
  isTileLoading = false;
  private loadingMaps = new Set<Map>();

  private dragThrottleTimeout: any = null;
  private isDragging: boolean = false;
  private originalOpacity: any = null;
  private isMobile: boolean = false;
  constructor(private mapService: MapV2Service, private analyzeService: AnalyzeService, private loadingService: LoadingService, private indexService: IndexService, private projectsService: ProjectsService, private translate: TranslateService, private ngZone: NgZone) {


    this.subscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.map) {
        this.map.setStyle(style);
      }
    });

    this.boundsSubscription = this.mapService.bounds$.subscribe(bounds => {
      if (bounds && this.map) {
        const mapBounds = new LngLatBounds(
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat]
        );
        this.map.fitBounds(mapBounds, {
          padding: 50,
          duration: 2000
        });
      }
    });

    this.comparisonSubscription = this.mapService.comparison$.subscribe(comparison => {
      if (comparison) {
        // Get the comparison project from the service
        this.comparisonProject = this.mapService.comparisonProject;
        this.projectName = this.mapService.projectName;
        this.setupComparison();
      }
    });

    this.stopComparisonSubscription = this.mapService.stopComparison$.subscribe(stop => {
      if (stop) {
        this.stopComparison();
      }
    });

    // Subscribe to project data changes
    this.projectDataSubscription = this.mapService.getCurrentProjectData$.subscribe(projectData => {
      this.currentProjectData = projectData;
      // Set project name from project data if available
      if (projectData && projectData.display_name) {
        this.projectName = projectData.display_name;
      }
    });

    // Subscribe to project info changes
    this.currentProjectInfo = this.projectsService.getCurrentProjectInfo();
    this.projectInfoSubscription = this.projectsService.currentProjectInfo$.subscribe(projectInfo => {
      this.currentProjectInfo = projectInfo;
    });

    // Subscribe to location changes for search functionality
    this.locationSubscription = this.mapService.location$.subscribe(location => {
      if (location && this.map) {
        this.map.flyTo({
          center: [location.lng, location.lat],
          zoom: 11,
          duration: 2000
        });
      }
    });
  }

  ngOnInit() {
    // Initial style is already set through the subscription in constructor
    // Set project name if already available in service
    this.projectName = this.mapService.projectName;
  }

  ngAfterViewInit() {
    this.isMobile = window.innerWidth < 768;
    if (this.mapContainer) {
      // Mobile-optimized map configuration
      const mapOptions: any = {
        container: this.mapContainer.nativeElement,
        style: this.mapStyle,
        center: this.center,
        zoom: this.zoom,
        dragRotate: false,
        // Mobile optimizations
        renderWorldCopies: false,
        maxTileCacheSize: 50, // Reduced from 100 to limit tile cache
        maxPitch: 0, // Prevent tilting which can cause more tiles to load
        refreshExpiredTiles: false, // Don't reload expired tiles automatically
        localIdeographFontFamily: false,
        attributionControl: false
      };


      this.map = new Map(mapOptions);
      this.mapService.setMap(this.map);

      // Add navigation control
      if (!this.isMobile) {
        this.map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
      }
      this.map.addControl(new ScaleControl(), 'bottom-left');
      this.map.dragRotate.disable();
      this.map.touchZoomRotate.disableRotation();

      // Setup map events (no projectId for main map - it uses the service subscription)
      this.setupMapEvents(this.map);
    }
  }

  private setupMapEvents(map: Map, projectId?: string): void {
    map.on('dataloading', (event: any) => {
      // Track tile/source requests to show a lightweight loading indicator
      if (event?.dataType === 'tile' || event?.dataType === 'source') {
        this.markMapAsLoading(map);
      }
    });

    map.on('idle', () => {
      this.markMapAsIdle(map);
    });

    map.on('error', () => {
      this.markMapAsIdle(map);
    });

    // Store original opacity for restoration
    if (!this.originalOpacity && map?.getLayer('geodata-fill')) {
      this.originalOpacity = map.getPaintProperty('geodata-fill', 'fill-opacity');
    }

    // Mobile-optimized panning event listeners
    map.on('dragstart', () => {
      if (this.mapService.getMapType() === 'hexagon') {
        return;
      }


      if (!this.isDragging) {
        this.isDragging = true;
        this.handleDragStart(map);
      }
    });



    map.on('dragend', () => {
      if (this.mapService.getMapType() === 'hexagon') {
        return;
      }

      if (this.dragThrottleTimeout) {
        clearTimeout(this.dragThrottleTimeout);
      }

      this.isDragging = false;
      this.handleDragEnd(map);
    });

    // Create popup for this map instance
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false
    });

    map.on('zoomend', () => {
      this.mapService.updateZoom(map.getZoom());

      // If this is a compare map (projectId is provided), update its style manually
      if (projectId) {
        const style = this.mapService['getProjectMapStyle'](projectId);
        map.setStyle(style);
      }
    });

    // Add sourcedata event handler to track tile loading
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'geodata' && e.isSourceLoaded) {
        this.loadingService.stopLoading();
      }
    });

    map.on('mousemove', 'geodata-fill', (e) => {
      if (e.features && e.features[0]) {
        const feature = e.features[0];
        const properties = feature.properties;
        if (properties) {
          const name = properties['name'] || 'Unknown';
          let popupContent = '';
          if (this.mapService.isDifferenceMap()) {
            const index = properties['index'] as number;
            const percentage = Math.abs(index * 100);
            const baselineName = this.currentProjectInfo?.baseline_project_name || this.translate.instant('MAP.TOOLTIP.BASELINE');
            const comparisonName = this.currentProjectInfo?.comparison_project_name || this.translate.instant('MAP.TOOLTIP.COMPARISON');

            if (index > 0) {
              const betterText = this.translate.instant('MAP.TOOLTIP.BETTER_THAN', {
                project1: comparisonName,
                percentage: percentage.toFixed(0),
                project2: baselineName
              });
              popupContent = `
                <div style="padding: 5px;">
                  <div><strong>${name}</strong></div>
                  <div>${betterText}</div>
                </div>
              `;
            } else if (index < 0) {
              const betterText = this.translate.instant('MAP.TOOLTIP.BETTER_THAN', {
                project1: baselineName,
                percentage: percentage.toFixed(0),
                project2: comparisonName
              });
              popupContent = `
                <div style="padding: 5px;">
                  <div><strong>${name}</strong></div>
                  <div>${betterText}</div>
                </div>
              `;
            } else {
              const equalText = this.translate.instant('MAP.TOOLTIP.EQUAL');
              popupContent = `
                <div style="padding: 5px;">
                  <div><strong>${name}</strong></div>
                  <div>${equalText}</div>
                </div>
              `;
            }
          } else {
            // Check if score visualization is selected
            if (this.mapService.getVisualizationType() === 'score') {
              const score = properties['score'] as number;
              const scoreText = score !== undefined && score !== null
                ? `${(score / 60).toFixed(1)} ${this.translate.instant('LEGEND.MINUTES')}`
                : 'N/A';
              popupContent = `
                <div style="padding: 5px;">
                  <div><strong>${name}</strong></div>
                  <div>${this.translate.instant('SIDEBAR.SCORE')}: ${scoreText}</div>
                </div>
              `;
            } else {
              popupContent = `
                <div style="padding: 5px;">
                  ${name}: <strong>${this.indexService.getIndexName(properties['index'])}</strong>
                </div>
              `;
            }
          }

          popup
            .setLngLat(e.lngLat)
            .setHTML(popupContent)
            .addTo(map);
        }
      }
    });

    map.on('mouseleave', 'geodata-fill', () => {
      popup.remove();
    });

    map.on('click', 'geodata-fill', (e) => {
      if (e.features && e.features[0]) {
        const feature = e.features[0];
        // Use the click coordinates as the center
        const coordinates = [e.lngLat.lng, e.lngLat.lat];
        const metadata = feature['layer']?.['metadata'] as { 'project-id': string };
        if (metadata) {
          this.analyzeService.setCurrentProject(metadata['project-id']);
        }

        const resolution = map && map.getZoom() > 10 ? "hexagon" : "gemeinde";
        // this.analyzeService.setCurrentProject(feature)
        this.analyzeService.setSelectedFeature(feature, resolution, coordinates);
        this.mapService.setSelectedFeature(feature.properties['id']);
      }
    });
  }

  private markMapAsLoading(map: Map): void {
    this.loadingMaps.add(map);
    this.setTileLoadingIndicator(true);
  }

  private markMapAsIdle(map: Map): void {
    this.loadingMaps.delete(map);
    this.setTileLoadingIndicator(this.loadingMaps.size > 0);
  }

  private setTileLoadingIndicator(isLoading: boolean): void {
    if (this.isTileLoading === isLoading) {
      return;
    }
    // Run inside Angular zone so the template updates
    this.ngZone.run(() => {
      this.isTileLoading = isLoading;
    });
  }

  private handleDragStart(map: Map): void {
    if (map?.getLayer('geodata-fill')) {
      // Store original opacity if not already stored
      if (!this.originalOpacity) {
        this.originalOpacity = map.getPaintProperty('geodata-fill', 'fill-opacity');
      }

      // Reduce opacity for better performance during drag
      const reducedOpacity = ['*', this.originalOpacity, 0.3];
      map.setPaintProperty('geodata-fill', 'fill-opacity', reducedOpacity);
    }
  }

  private handleDragEnd(map: Map): void {
    if (map?.getLayer('geodata-fill') && this.originalOpacity) {
      // Restore original opacity
      map.setPaintProperty('geodata-fill', 'fill-opacity', this.originalOpacity);
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.boundsSubscription) {
      this.boundsSubscription.unsubscribe();
    }
    if (this.comparisonSubscription) {
      this.comparisonSubscription.unsubscribe();
    }
    if (this.stopComparisonSubscription) {
      this.stopComparisonSubscription.unsubscribe();
    }
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }
    if (this.projectDataSubscription) {
      this.projectDataSubscription.unsubscribe();
    }
    if (this.dragThrottleTimeout) {
      clearTimeout(this.dragThrottleTimeout);
    }
  }

  setProject(projectId: string) {
    this.mapService.setProject(projectId);
  }

  onLocationSelected(location: { lng: number, lat: number }) {
    if (this.map) {
      this.map.flyTo({
        center: [location.lng, location.lat],
        zoom: 11,
        duration: 2000
      });
    }
  }

  private setupComparison() {
    this.mapContainer!.nativeElement.style.display = "none";
    this.comparisonContainer!.nativeElement.style.display = "block";
    this.setupCompareMap();
  }

  private setupCompareMap() {
    this.isComparison = true;

    // Get bounds for proper zoom calculation
    const bounds = this.mapService.getDataBounds();
    let initialCenter = this.center;
    let initialZoom = this.zoom;

    if (bounds) {
      const mapBounds = new LngLatBounds(
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat]
      );

      // Calculate center and zoom based on bounds
      const center = mapBounds.getCenter();
      initialCenter = [center.lng, center.lat];

      // Calculate appropriate zoom level for the bounds
      const latDiff = bounds.maxLat - bounds.minLat;
      const lngDiff = bounds.maxLng - bounds.minLng;
      const latZoom = Math.log2(360 / latDiff);
      const lngZoom = Math.log2(720 / lngDiff);
      initialZoom = Math.min(latZoom, lngZoom) - 1; // Subtract 1 to add some padding
    }

    // Update the service's current zoom to match the calculated zoom
    this.mapService.updateZoom(initialZoom);

    const beforeMap = new Map({
      container: "before",
      style: this.mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      dragRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxTileCacheSize: 50, // Reduced to limit tile cache
      maxPitch: 0, // Prevent tilting which can cause more tiles to load
      refreshExpiredTiles: false // Don't reload expired tiles automatically
    });

    // Add navigation controls to before map
    if (!this.isMobile) {
      beforeMap.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    }
    beforeMap.addControl(new ScaleControl(), 'bottom-left');
    beforeMap.dragRotate.disable();
    beforeMap.touchZoomRotate.disableRotation();

    // Get the correct style for after map based on current zoom
    let afterStyle = this.mapStyle;
    if (this.comparisonProject && this.comparisonProject.id !== undefined && this.comparisonProject.id !== null) {
      afterStyle = this.mapService['getProjectMapStyle'](String(this.comparisonProject.id));
    }

    const afterMap = new Map({
      container: "after",
      style: afterStyle,
      center: initialCenter,
      zoom: initialZoom,
      dragRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxTileCacheSize: 50, // Reduced to limit tile cache
      maxPitch: 0, // Prevent tilting which can cause more tiles to load
      refreshExpiredTiles: false // Don't reload expired tiles automatically
    });

    // Add navigation controls to after map
    if (!this.isMobile) {
      afterMap.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    }
    afterMap.addControl(new ScaleControl(), 'bottom-left');
    afterMap.dragRotate.disable();
    afterMap.touchZoomRotate.disableRotation();

    // Wait for both maps to load, then zoom to bounds and setup events
    let mapsLoaded = 0;
    const totalMaps = 2;

    const setupMaps = () => {
      mapsLoaded++;
      if (mapsLoaded === totalMaps) {
        // Both maps are loaded, now zoom to bounds and setup events
        if (bounds) {
          const mapBounds = new LngLatBounds(
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat]
          );

          beforeMap.fitBounds(mapBounds, {
            padding: 50,
            duration: 0 // No animation for comparison setup
          });

          afterMap.fitBounds(mapBounds, {
            padding: 50,
            duration: 0 // No animation for comparison setup
          });
        }

        // Setup events after zoom is complete
        setTimeout(() => {
          this.setupMapEvents(beforeMap, this.mapService.getCurrentProject() || undefined);
          this.setupMapEvents(afterMap, this.comparisonProject ? String(this.comparisonProject.id) : undefined);
        }, 100);
      }
    };

    beforeMap.on('load', setupMaps);
    afterMap.on('load', setupMaps);

    var container = "#comparison-container";

    var compare = new MaplibreCompare(beforeMap, afterMap, container, {
      mousemove: false,
      // orientation: 'vertical'
    });
  }

  stopComparison() {
    this.isComparison = false;
    this.mapContainer!.nativeElement.style.display = "block";
    this.comparisonContainer!.nativeElement.style.display = "none";
  }

  formatCreationDate(date: Date | undefined): string {
    if (!date) return '';
    const creationDate = new Date(date);
    return `${creationDate.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })}`;
  }
}
