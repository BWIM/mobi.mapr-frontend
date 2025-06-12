import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService, ScoreEntry } from './statistics.service';
import { Subscription } from 'rxjs';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from '../services/loading.service';
import { MultiSelectModule } from 'primeng/multiselect';
import { MapV2Service } from '../map-v2/map-v2.service';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    SharedModule,
    ScrollPanelModule,
    ButtonModule,
    ProgressSpinnerModule,
    MultiSelectModule
  ],
  templateUrl: './statistics.component.html'
})
export class StatisticsComponent{
  // visible: boolean = false;
  // private subscription: Subscription;
  // loading: boolean = false;
  // stateScores: ScoreEntry[] = [];
  // countyScores: ScoreEntry[] = [];
  // municipalityScores: ScoreEntry[] = [];
  // filteredMunicipalityScores: ScoreEntry[] = [];
  // loadingMunicipalities: boolean = false;
  
  // averageType: 'mean' | 'median' = 'mean';
  // populationArea: 'pop' | 'area' = 'pop';

  // populationCategories = [
  //   { label: 'Landgemeinden (0-5.000)', value: 'small', min: 0, max: 5000 },
  //   { label: 'Kleine Kleinstädte (5.001-10.000)', value: 'small', min: 5001, max: 10000 },
  //   { label: 'Große Kleinstädte (10.001-20.000)', value: 'medium', min: 10001, max: 20000 },
  //   { label: 'Kleine Mittelstädte (20.001-50.000)', value: 'medium', min: 20001, max: 50000 },
  //   { label: 'Große Mittelstädte (50.001-100.000)', value: 'large', min: 50001, max: 100000 },
  //   { label: 'Kleinere Großstädte (100.001-500.000)', value: 'large', min: 100001, max: 500000 },
  //   { label: 'Große Großstädte (>500.000)', value: 'large', min: 500001, max: Infinity }
  // ];
  // selectedCategories: any[] = this.populationCategories;

  // // Color mapping based on MapBuildService colors
  // readonly scoreColors = {
  //   error: 'rgb(128, 128, 128)',
  //   best: 'rgb(50, 97, 45)',
  //   good: 'rgb(60, 176, 67)',
  //   medium: 'rgb(238, 210, 2)',
  //   poor: 'rgb(237, 112, 20)',
  //   bad: 'rgb(194, 24, 7)',
  //   worst: 'rgb(150, 86, 162)'
  // };

  // constructor(
  //   private statisticsService: StatisticsService,
  //   private mapService: MapV2Service,
  //   private loadingService: LoadingService
  // ) {
  //   this.subscription = new Subscription();
    
  //   // Subscribe to visibility changes
  //   this.subscription.add(
  //     this.statisticsService.visible$.subscribe(
  //       visible => {
  //         this.visible = visible;
  //         if (visible) {
  //           this.updateScores();
  //         }
  //       }
  //     )
  //   );

  //   // Subscribe to visualization settings changes
  //   // this.subscription.add(
  //   //   this.mapService.visualizationSettings$.subscribe(settings => {
  //   //     this.averageType = settings.averageType;
  //   //     this.populationArea = settings.populationArea;
  //   //     if (this.visible) {
  //   //       this.updateScores();
  //   //     }
  //   //   })
  //   // );
  // }

  // ngOnInit() {}

  // ngOnDestroy() {
  //   if (this.subscription) {
  //     this.subscription.unsubscribe();
  //   }
  // }

  // async loadAllMunicipalities(): Promise<void> {
  //   try {
  //     this.loadingMunicipalities = true;
  //     await this.statisticsService.loadAllMunicipalities();
  //     await this.updateScores();
  //   } catch (error) {
  //     console.error('Error loading municipalities:', error);
  //   } finally {
  //     this.loadingMunicipalities = false;
  //   }
  // }

  // private async updateScores(): Promise<void> {
  //   try {
  //     this.loading = true;
  //     this.loadingService.startLoading();
  //     const [stateResult, countyResult, municipalityResult] = await Promise.all([
  //       this.statisticsService.getTopScores('state'),
  //       this.statisticsService.getTopScores('county'),
  //       this.statisticsService.getTopScores('municipality')
  //     ]);
      
  //     this.stateScores = stateResult;
  //     this.countyScores = countyResult;
  //     this.municipalityScores = municipalityResult;
  //     this.applyPopulationFilter();
  //   } catch (error) {
  //     console.error('Error updating scores:', error);
  //     // Reset scores on error
  //     this.stateScores = [];
  //     this.countyScores = [];
  //     this.municipalityScores = [];
  //     this.filteredMunicipalityScores = [];
  //   } finally {
  //     this.loadingService.stopLoading();
  //     this.loading = false;
  //   }
  // }

  // onPopulationCategoryChange(): void {
  //   this.applyPopulationFilter();
  // }

  // private applyPopulationFilter(): void {
  //   if (this.selectedCategories.length === 0) {
  //     this.filteredMunicipalityScores = this.municipalityScores;
  //     return;
  //   }

  //   this.filteredMunicipalityScores = this.municipalityScores.filter(score => {
  //     if (!score.population) return false;
  //     console.log(score);
  //     return this.selectedCategories.some(category => {
  //       const { min, max } = category;
  //       return score.population > min && score.population <= max;
  //     });
  //   });
  // }

  // getScoreGrade(score: number): string {
  //   if (score <= 0) return "Error";
  //   if (score <= 0.35) return "A";
  //   if (score <= 0.5) return "B";
  //   if (score <= 0.71) return "C";
  //   if (score <= 1) return "D";
  //   if (score <= 1.41) return "E";
  //   return "F";
  // }

  // getScoreColor(score: number): string {
  //   if (score <= 0) return this.scoreColors.error;
  //   if (score <= 0.35) return this.scoreColors.best;
  //   if (score <= 0.5) return this.scoreColors.good;
  //   if (score <= 0.71) return this.scoreColors.medium;
  //   if (score <= 1) return this.scoreColors.poor;
  //   if (score <= 1.41) return this.scoreColors.bad;
  //   return this.scoreColors.worst;
  // }

  // onFeatureClick(entry: ScoreEntry): void {
  //   // Close the statistics overlay
  //   this.statisticsService.visible = false;

  //   const map = this.mapService.getMap();
  //   if (!map) return;

  //   const vectorLayer = this.mapService.getMainLayer();
  //   if (!vectorLayer || !vectorLayer.getSource()) return;

  //   let targetZoom = 7.5;
  //   if (entry.level === 'county') {
  //     targetZoom = 9;
  //   } else if (entry.level === 'municipality') {
  //     targetZoom = 10;
  //   }

  //   // Helper to animate and return a promise
  //   function animateView(view: any, options: any): Promise<void> {
  //     return new Promise(resolve => {
  //       view.animate({ ...options, duration: 600 }, resolve);
  //     });
  //   }

  //   const view = map.getView();

  //   // Step 1: Zoom out to a safe level if needed
  //   let safeZoom = 6;
  //   if (entry.level === 'county') {
  //     safeZoom = 8;
  //   } else if (entry.level === 'municipality') {
  //     safeZoom = 10;
  //   }
  //   const currentZoom = view.getZoom();
  //   let zoomOutPromise: Promise<void>;

  //   if (currentZoom && currentZoom > safeZoom) {
  //     zoomOutPromise = animateView(view, { zoom: safeZoom });
  //   } else {
  //     zoomOutPromise = Promise.resolve();
  //   }

  //   zoomOutPromise.then(() => {
  //     // Step 2: Poll for the feature (case-insensitive, trimmed)
  //     const maxTries = 10;
  //     const delay = 200;

  //     function findFeature(): any {
  //       const features = vectorLayer?.getSource()?.getFeatures();
  //       return features?.find(f => {
  //         const featureName = (f.get('name') || '').trim().toLowerCase();
  //         const entryName = (entry.name || '').trim().toLowerCase();
  //         const featureLevel = (f.get('level') || '').trim().toLowerCase();
  //         const entryLevel = (entry.level || '').trim().toLowerCase();
  //         return featureName === entryName && featureLevel === entryLevel;
  //       });
  //     }

  //     function pollForFeature(triesLeft: number) {
  //       const feature = findFeature();
  //       if (feature) {
  //         const extent = feature.getGeometry()?.getExtent();
  //         if (extent) {
  //           view.animate(
  //             { zoom: targetZoom, duration: 800 },
  //             () => {
  //               view.fit(extent, {
  //                 duration: 1000,
  //                 padding: [50, 50, 50, 50]
  //               });
  //             }
  //           );
  //         }
  //       } else if (triesLeft > 0) {
  //         setTimeout(() => pollForFeature(triesLeft - 1), delay);
  //       } else {
  //         console.warn('Feature not found after zooming out and polling:', entry);
  //       }
  //     }

  //     pollForFeature(maxTries);
  //   });
  // }
}
 // TODO: Click on name to zoom on map