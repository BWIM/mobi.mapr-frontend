import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';
import Feature from 'ol/Feature';
import { Properties } from './analyze.interface';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  loading: boolean = false;
  private subscription: Subscription;
  projectDetails: any;
  feature: Feature | undefined;
  properties: Properties | undefined;

  // Diagrammdaten
  personaChartData: any;
  activitiesChartData: any;
  modesChartData: any;
  radarChartOptions: any;
  barChartOptions: any;
  pieChartOptions: any;

  hasPersonaData(): boolean {
    return Object.keys(this.projectDetails?.persona_scores || {}).length > 0;
  }

  hasActivityData(): boolean {
    return Object.keys(this.projectDetails?.category_scores || {}).length > 0;
  }

  hasModeData(): boolean {
    return Object.keys(this.projectDetails?.mode_scores || {}).length > 0;
  }

  constructor(
    private analyzeService: AnalyzeService,
    private projectsService: ProjectsService,
    private cdr: ChangeDetectorRef
  ) {
    this.subscription = this.analyzeService.visible$.subscribe(
      visible => {
        this.visible = visible;
        if (visible) {
          const state = this.analyzeService.getCurrentState();
          if (state.feature) {
            this.feature = state.feature;
            this.properties = this.feature.getProperties() as Properties;
          }
          if (state.projectId && state.mapType && state.feature) {
            this.loading = true;
            this.projectsService.getProjectDetails(state.projectId, state.mapType, state.feature.getId()!.toString())
              .subscribe({
                next: (details) => {
                  this.projectDetails = details;
                  this.initializeChartData();
                },
                error: (error) => {
                  console.error('Error loading project details:', error);
                  this.loading = false;
                }
              });
          } else {
            console.warn('Nicht alle erforderlichen Parameter sind verfügbar:', state);
          }
        }
      }
    );

    // Grundlegende Chart-Optionen für verschiedene Diagrammtypen
    this.radarChartOptions = {      plugins: {
      legend: {
        position: 'bottom'
      }
    },
    responsive: true,
    maintainAspectRatio: false
    };

    this.barChartOptions = {      plugins: {
      legend: {
        position: 'bottom'
      }
    },
    responsive: true,
    maintainAspectRatio: false
    };

    this.pieChartOptions = {
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      responsive: true,
      maintainAspectRatio: false
    };
  }

  private initializeChartData(): void {
    this.initializeModesChart();
    this.initializeActivitiesChart();
    this.initializePersonaChart();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private initializeModesChart(): void {
    const modeScores = this.projectDetails?.mode_scores || {};
    const labels = Object.values(modeScores).map((mode: any) => mode.display_name);
    const data = Object.values(modeScores).map((mode: any) => mode.score);

    this.modesChartData = {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF'
        ]
      }]
    };
  }

  private initializeActivitiesChart(): void {
    const categoryScores = this.projectDetails?.category_scores || {};
    const labels = Object.values(categoryScores).map((category: any) => category.display_name);
    const data = Object.values(categoryScores).map((category: any) => category.score);

    this.activitiesChartData = {
      type: 'bar',
      labels: labels,
      datasets: [{
        label: 'Aktivitätswerte',
        data: data,
        backgroundColor: '#ffcc00',
        borderColor: '#ffcc00',
        borderWidth: 1
      }]
    };
  }

  private initializePersonaChart(): void {
    const personaScores = this.projectDetails?.persona_scores || {};
    const labels = Object.values(personaScores).map((persona: any) => persona.display_name);
    const data = Object.values(personaScores).map((persona: any) => persona.score);

    this.personaChartData = {
      labels: labels,
      datasets: [{
        label: 'Persona-Werte',
        data: data,
        backgroundColor: 'rgba(255, 204, 0, 0.2)',
        borderColor: 'rgb(255, 204, 0)',
        pointBackgroundColor: 'rgb(255, 204, 0)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgb(255, 204, 0)'
      }]
    };
  }

  ngOnInit() {
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  hide() {
    this.analyzeService.hide();
  }
}
