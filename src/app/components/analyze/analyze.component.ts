import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

interface TopListItem {
  rank: number;
  name: string;
  population?: number;
  score?: number;
  grade?: string;
}

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnInit, AfterViewInit {
  @ViewChild('activitiesChart', { static: false }) activitiesChartRef!: ElementRef<HTMLCanvasElement>;
  
  selectedItem: TopListItem | null = null;
  private activitiesChart: Chart | null = null;
  selectedItemPlatz: number = 23; // Platz for selected item (can differ from rank in top list)

  selectedModes: string[] = ['bicycle', 'car', 'walking']; // No train for selected item

  activitiesData = [
    { name: 'täglicher Bedarf', percentage: 22, color: 'green' },
    { name: 'Besuch/Freund*innen treffen', percentage: 17, color: 'yellow' },
    { name: 'Restaurant, Gaststätte, Mittagessen, Kneipe, Disco', percentage: 9, color: 'green' },
    { name: 'Sport (selbst aktiv)', percentage: 7, color: 'red' },
    { name: 'Sportverein', percentage: 6, color: 'darkgreen' },
    { name: 'Spaziergang, Spazierfahrt', percentage: 5, color: 'green' }
  ];

  ngOnInit(): void {
    // TODO: Subscribe to feature selection from map
    // Set default selected item (e.g., Karlsruhe)
    this.selectedItem = {
      rank: 2,
      name: 'Karlsruhe',
      population: 309050,
      grade: 'C+'
    };
  }

  ngAfterViewInit(): void {
    if (this.selectedItem) {
      setTimeout(() => this.initializeChart(), 0);
    }
  }

  private initializeChart(): void {
    if (!this.activitiesChartRef || !this.activitiesChartRef.nativeElement) {
      return;
    }

    // Destroy existing chart if any
    if (this.activitiesChart) {
      this.activitiesChart.destroy();
    }

    const ctx = this.activitiesChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    const colors = this.activitiesData.map(item => {
      switch (item.color) {
        case 'green': return '#4caf50';
        case 'yellow': return '#ffeb3b';
        case 'red': return '#f44336';
        case 'darkgreen': return '#2e7d32';
        default: return '#9e9e9e';
      }
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.activitiesData.map(item => item.name),
        datasets: [{
          label: 'Relevanz (%)',
          data: this.activitiesData.map(item => item.percentage),
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.parsed.x}%`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 25,
            ticks: {
              stepSize: 5,
              color: '#ffffff',
              font: {
                size: 10
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            ticks: {
              color: '#ffffff',
              font: {
                size: 10
              }
            },
            grid: {
              display: false
            }
          }
        }
      }
    };

    this.activitiesChart = new Chart(ctx, config);
  }
}
