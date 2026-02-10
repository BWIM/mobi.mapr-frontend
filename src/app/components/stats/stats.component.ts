import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';

interface TopListItem {
  rank: number;
  name: string;
  population?: number;
  score?: number;
  grade?: string;
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    TranslateModule
  ],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css'
})
export class StatsComponent implements OnInit {
  topListItems: TopListItem[] = [];
  selectedItem: TopListItem | null = null;
  populationFilter: string = 'all';

  populationFilters = [
    { label: '0-5K', value: '0-5k' },
    { label: '5-10K', value: '5-10k' },
    { label: '10-20K', value: '10-20k' },
    { label: '20-50K', value: '20-50k' },
    { label: '50-100K', value: '50-100k' },
    { label: '100-500K', value: '100-500k' },
    { label: '>500K', value: '>500k' },
    { label: 'Alle', value: 'all' }
  ];

  ngOnInit(): void {
    // TODO: Load top list data from service
    this.loadTopList();
    // Set Karlsruhe as selected by default (matching screenshot)
    this.selectedItem = this.topListItems.find(item => item.name === 'Karlsruhe') || null;
  }

  private loadTopList(): void {
    // Top 10 regions matching screenshot
    this.topListItems = [
      { rank: 1, name: 'Stuttgart', population: 626275, grade: 'A+' },
      { rank: 2, name: 'Karlsruhe', population: 309050, grade: 'C+' },
      { rank: 3, name: 'Rhein-Neckar', population: 1450000, grade: 'B' },
      { rank: 4, name: 'Neckaralb', population: 0, grade: '' },
      { rank: 5, name: 'Nordschwarzwald', population: 0, grade: '' },
      { rank: 6, name: 'Donau-Iller', population: 0, grade: '' },
      { rank: 7, name: 'Bodensee-Oberschwaben', population: 0, grade: '' },
      { rank: 8, name: 'Hochrhein-Bodensee', population: 0, grade: '' },
      { rank: 9, name: 'südlicher Oberrhein', population: 0, grade: '' },
      { rank: 10, name: 'Heilbronn-Franken', population: 0, grade: '' }
    ];
  }


  onPopulationFilterChange(filter: string): void {
    this.populationFilter = filter;
    // TODO: Filter top list based on population
    console.log('Population filter changed:', filter);
  }

  onItemClick(item: TopListItem): void {
    this.selectedItem = item;
    // TODO: Emit selection event or update map
    console.log('Selected item:', item);
  }
}
