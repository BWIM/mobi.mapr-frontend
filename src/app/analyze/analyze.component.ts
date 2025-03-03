import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  private subscription: Subscription;
  projectDetails: any;
  
  // Diagrammdaten
  personaChartData: any;
  activitiesChartData: any;
  modesChartData: any;
  chartOptions: any;

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
    private projectsService: ProjectsService
  ) {
    this.subscription = this.analyzeService.visible$.subscribe(
      visible => {
        this.visible = visible;
        if (visible) {
          const state = this.analyzeService.getCurrentState();
          if (state.projectId && state.mapType && state.featureId) {
            this.projectsService.getProjectDetails(state.projectId, state.mapType, state.featureId)
              .subscribe({
                next: (details) => {
                  this.projectDetails = details;
                  this.initializeChartData();
                },
                error: (error) => {
                  console.error('Error loading project details:', error);
                }
              });
          } else {
            console.warn('Nicht alle erforderlichen Parameter sind verfügbar:', state);
          }
        }
      }
    );

    // Grundlegende Chart-Optionen
    this.chartOptions = {
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
      labels: labels,
      datasets: [{
        label: 'Aktivitätswerte',
        data: data,
        backgroundColor: '#36A2EB'
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
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgb(54, 162, 235)',
        pointBackgroundColor: 'rgb(54, 162, 235)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgb(54, 162, 235)'
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
