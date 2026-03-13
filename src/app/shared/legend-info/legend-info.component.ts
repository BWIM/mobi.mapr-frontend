import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../shared.module';

@Component({
  selector: 'app-legend-info',
  standalone: true,
  imports: [CommonModule, TranslateModule, SharedModule],
  templateUrl: './legend-info.component.html',
  styleUrl: './legend-info.component.css'
})
export class LegendInfoComponent {
  // Quality (index) colors - A through F
  qualityColors = [
    { letter: 'A', color: 'rgba(50, 97, 45, 0.7)' },
    { letter: 'B', color: 'rgba(60, 176, 67, 0.7)' },
    { letter: 'C', color: 'rgba(238, 210, 2, 0.7)' },
    { letter: 'D', color: 'rgba(237, 112, 20, 0.7)' },
    { letter: 'E', color: 'rgba(194, 24, 7, 0.7)' },
    { letter: 'F', color: 'rgba(197, 136, 187, 0.7)' }
  ];

  // Time (score) colors - updated ranges
  timeColors = [
    { value: '0-7', color: 'rgb(23, 25, 63)' },
    { value: '8-15', color: 'rgb(43, 40, 105)' },
    { value: '16-23', color: 'rgb(74, 89, 160)' },
    { value: '24-30', color: 'rgb(90, 135, 185)' },
    { value: '31-45', color: 'rgb(121, 194, 230)' },
    { value: '45+', color: 'rgb(162, 210, 235)' }
  ];
}
