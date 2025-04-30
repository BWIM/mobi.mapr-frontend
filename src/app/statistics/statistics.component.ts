import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService, ScoreEntry } from './statistics.service';
import { Subscription } from 'rxjs';
import { MapService } from '../map/map.service';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    SharedModule,
    ScrollPanelModule,
    ButtonModule,
    ProgressSpinnerModule
  ],
  templateUrl: './statistics.component.html'
})
export class StatisticsComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  private subscription: Subscription;
  
  stateScores: ScoreEntry[] = [];
  countyScores: ScoreEntry[] = [];
  municipalityScores: ScoreEntry[] = [];
  loadingMunicipalities: boolean = false;
  
  averageType: 'mean' | 'median' = 'mean';
  populationArea: 'pop' | 'area' = 'pop';

  // Color mapping based on MapBuildService colors
  readonly scoreColors = {
    error: 'rgb(128, 128, 128)',
    best: 'rgb(50, 97, 45)',
    good: 'rgb(60, 176, 67)',
    medium: 'rgb(238, 210, 2)',
    poor: 'rgb(237, 112, 20)',
    bad: 'rgb(194, 24, 7)',
    worst: 'rgb(150, 86, 162)'
  };

  constructor(
    private statisticsService: StatisticsService,
    private mapService: MapService
  ) {
    this.subscription = new Subscription();
    
    // Subscribe to visibility changes
    this.subscription.add(
      this.statisticsService.visible$.subscribe(
        visible => {
          this.visible = visible;
          if (visible) {
            this.updateScores();
          }
        }
      )
    );

    // Subscribe to visualization settings changes
    this.subscription.add(
      this.mapService.visualizationSettings$.subscribe(settings => {
        this.averageType = settings.averageType;
        this.populationArea = settings.populationArea;
        if (this.visible) {
          this.updateScores();
        }
      })
    );
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  async loadAllMunicipalities(): Promise<void> {
    try {
      this.loadingMunicipalities = true;
      await this.statisticsService.loadAllMunicipalities();
      await this.updateScores();
    } catch (error) {
      console.error('Error loading municipalities:', error);
    } finally {
      this.loadingMunicipalities = false;
    }
  }

  private async updateScores(): Promise<void> {
    try {
      const [stateResult, countyResult, municipalityResult] = await Promise.all([
        this.statisticsService.getTopScores('state'),
        this.statisticsService.getTopScores('county'),
        this.statisticsService.getTopScores('municipality')
      ]);
      
      this.stateScores = stateResult;
      this.countyScores = countyResult;
      this.municipalityScores = municipalityResult;
    } catch (error) {
      console.error('Error updating scores:', error);
      // Reset scores on error
      this.stateScores = [];
      this.countyScores = [];
      this.municipalityScores = [];
    }
  }

  getScoreGrade(score: number): string {
    if (score <= 0) return "Error";
    if (score <= 0.35) return "A";
    if (score <= 0.5) return "B";
    if (score <= 0.71) return "C";
    if (score <= 1) return "D";
    if (score <= 1.41) return "E";
    return "F";
  }

  getScoreColor(score: number): string {
    if (score <= 0) return this.scoreColors.error;
    if (score <= 0.35) return this.scoreColors.best;
    if (score <= 0.5) return this.scoreColors.good;
    if (score <= 0.71) return this.scoreColors.medium;
    if (score <= 1) return this.scoreColors.poor;
    if (score <= 1.41) return this.scoreColors.bad;
    return this.scoreColors.worst;
  }
}
