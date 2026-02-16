import { Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { StatsComponent } from './stats/stats.component';
import { AnalyzeComponent } from './analyze/analyze.component';

@Component({
  selector: 'app-right',
  imports: [SharedModule, StatsComponent, AnalyzeComponent],
  templateUrl: './right.component.html',
  styleUrl: './right.component.css',
})
export class RightComponent {

}
