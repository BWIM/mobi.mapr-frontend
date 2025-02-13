import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CardModule, ChartModule, ButtonModule, PanelModule, MapComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  data = {
    labels: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni'],
    datasets: [
      {
        label: 'Beispieldaten 2024',
        data: [65, 59, 80, 81, 56, 55],
        fill: false,
        borderColor: '#42A5F5'
      }
    ]
  };

  options = {
    responsive: true,
    maintainAspectRatio: false
  };
}
