import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-analyze',
  imports: [CommonModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css',
})
export class AnalyzeComponent {
  selectedFeature: any | null = null;

}
