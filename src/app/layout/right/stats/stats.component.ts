import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { County } from '../../../interfaces/features';

interface PopulationFilter {
  label: string;
  value: string;
  min?: number;
  max?: number;
}

@Component({
  selector: 'app-stats',
  imports: [CommonModule],
  templateUrl: './stats.component.html',
})
export class StatsComponent {
  selectedFilter: string = '5-10';
  
  populationFilters: PopulationFilter[] = [
    { label: '0 – 5 K', value: '0-5', min: 0, max: 5000 },
    { label: '5 – 10 K', value: '5-10', min: 5000, max: 10000 },
    { label: '10 – 20 K', value: '10-20', min: 10000, max: 20000 },
    { label: '20 – 50 K', value: '20-50', min: 20000, max: 50000 },
    { label: '50 – 100 K', value: '50-100', min: 50000, max: 100000 },
    { label: '100 – 500 K', value: '100-500', min: 100000, max: 500000 },
    { label: '< 500 K', value: '500+', min: 500000, max: Infinity },
    { label: 'Alle', value: 'all' }
  ];

  // Sample data matching the screenshot
  counties: County[] = [
    { id: 1, name: 'Stuttgart', rank: 1, population: 626275, index: 0.25, score: 0 },
    { id: 2, name: 'Karlsruhe', rank: 2, population: 315643, index: 0.27, score: 0 },
    { id: 3, name: 'Rhein-Neckar', rank: 3, population: 548355, index: 0.30, score: 0 },
    { id: 4, name: 'Neckaralb', rank: 4, population: 504311, index: 0.31, score: 0 },
    { id: 5, name: 'Nordschwarzwald', rank: 5, population: 371415, index: 0.34, score: 0 },
    { id: 6, name: 'Donau-Iller', rank: 6, population: 465882, index: 0.38, score: 0 },
    { id: 7, name: 'Bodensee-Oberschwaben', rank: 7, population: 315643, index: 0.39, score: 0 },
    { id: 8, name: 'Hochrhein-Bodensee', rank: 8, population: 280000, index: 0.42, score: 0 },
    { id: 9, name: 'südlicher Oberrhein', rank: 9, population: 425000, index: 0.60, score: 0 },
    { id: 10, name: 'Heilbronn-Franken', rank: 10, population: 910000, index: 0.62, score: 0 }
  ];

  get filteredCounties(): County[] {
    if (this.selectedFilter === 'all') {
      return this.counties.slice(0, 10);
    }
    
    const filter = this.populationFilters.find(f => f.value === this.selectedFilter);
    if (!filter || !filter.min) {
      return this.counties.slice(0, 10);
    }
    
    return this.counties
      .filter(county => {
        if (filter.max === Infinity) {
          return county.population >= filter.min!;
        }
        return county.population >= filter.min! && county.population < filter.max!;
      })
      .slice(0, 10);
  }

  selectFilter(value: string) {
    this.selectedFilter = value;
  }

  getButtonClasses(filterValue: string): string {
    const baseClasses = 'px-2 py-1 rounded-md border-[var(--primary-color)] cursor-pointer text-xs font-medium transition-all duration-200 whitespace-nowrap hover:opacity-90';
    if (this.selectedFilter === filterValue) {
      return `${baseClasses} bg-[var(--primary-color)] text-[var(--background-color)] shadow-md border border-[var(--primary-color)]`;
    }
    return `${baseClasses} bg-[var(--background-color)] text-[var(--primary-color)] border-[var(--primary-color)]`;
  }

  getRating(index: number): string {
    if (index <= 0) return "Error";
    if (index < 0.28) return "A+";
    if (index < 0.32) return "A";
    if (index < 0.35) return "A-";
    if (index < 0.4) return "B+";
    if (index < 0.45) return "B";
    if (index < 0.5) return "B-";
    if (index < 0.56) return "C+";
    if (index < 0.63) return "C";
    if (index < 0.71) return "C-";
    if (index < 0.8) return "D+";
    if (index < 0.9) return "D";
    if (index < 1.0) return "D-";
    if (index < 1.12) return "E+";
    if (index < 1.26) return "E";
    if (index < 1.41) return "E-";
    if (index < 1.59) return "F+";
    if (index < 1.78) return "F";
    return "F-";
  }
}
