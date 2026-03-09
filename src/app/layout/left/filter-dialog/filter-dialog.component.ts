import { Component, OnInit, Inject, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { FilterConfigService } from '../../../services/filter-config.service';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';

export interface FilterDialogData {
  selectedActivities: number[];
  selectedPersonas: number | null;
  selectedRegioStars: number[];
  selectedStates: number[];
  hasCategories?: boolean;
}

@Component({
  selector: 'app-filter-dialog',
  standalone: true,
  imports: [
    SharedModule,
    TranslateModule,
    MatRadioModule,
  ],
  templateUrl: './filter-dialog.component.html',
  styleUrl: './filter-dialog.component.css'
})
export class FilterDialogComponent implements OnInit {
  private filterConfigService = inject(FilterConfigService);

  // Get data from FilterConfigService
  activities = this.filterConfigService.allActivities;
  groupedCategories = this.filterConfigService.groupedCategories;
  personas = this.filterConfigService.allPersonas;
  regiostars = this.filterConfigService.allRegioStars;
  groupedRegioStars = this.filterConfigService.groupedRegioStars;
  states = this.filterConfigService.allStates;

  selectedActivities: Set<number> = new Set();
  selectedPersonas: number | null = null;
  selectedRegioStars: Set<number> = new Set();
  selectedStates: Set<number> = new Set();

  // Track expanded/collapsed state for groups
  expandedCategoryGroups: Set<string> = new Set();
  expandedRegioStarGroups: Set<string> = new Set();

  hasCategories: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<FilterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FilterDialogData
  ) {
    // Initialize selections from data
    this.selectedActivities = new Set(data.selectedActivities || []);
    // Handle both old array format and new single value format
    if (Array.isArray(data.selectedPersonas)) {
      this.selectedPersonas = data.selectedPersonas.length > 0 ? data.selectedPersonas[0] : null;
    } else {
      this.selectedPersonas = data.selectedPersonas ?? null;
    }
    this.selectedRegioStars = new Set(data.selectedRegioStars || []);
    this.selectedStates = new Set(data.selectedStates || []);
    this.hasCategories = data.hasCategories ?? false;
  }

  ngOnInit() {
    // Data is already loaded by FilterConfigService, no need to load here
  }


  toggleActivity(id: number) {
    if (this.selectedActivities.has(id)) {
      this.selectedActivities.delete(id);
    } else {
      this.selectedActivities.add(id);
    }
  }

  selectPersona(id: number) {
    this.selectedPersonas = id;
  }

  toggleRegioStar(id: number) {
    if (this.selectedRegioStars.has(id)) {
      this.selectedRegioStars.delete(id);
    } else {
      this.selectedRegioStars.add(id);
    }
  }

  // Category methods with nested selection
  toggleCategory(categoryId: number) {
    if (this.selectedActivities.has(categoryId)) {
      this.selectedActivities.delete(categoryId);
    } else {
      this.selectedActivities.add(categoryId);
    }
  }

  toggleCategoryGroup(wegezweck: string) {
    const group = this.groupedCategories().find(g => g.wegezweck === wegezweck);
    if (!group) return;

    const allSelected = group.categories.every(cat => this.selectedActivities.has(cat.id));
    
    if (allSelected) {
      // Deselect all in group
      group.categories.forEach(cat => this.selectedActivities.delete(cat.id));
    } else {
      // Select all in group
      group.categories.forEach(cat => this.selectedActivities.add(cat.id));
    }
  }

  isCategorySelected(categoryId: number): boolean {
    return this.selectedActivities.has(categoryId);
  }

  getCategoryGroupState(wegezweck: string): 'all' | 'some' | 'none' {
    const group = this.groupedCategories().find(g => g.wegezweck === wegezweck);
    if (!group || group.categories.length === 0) return 'none';

    const selectedCount = group.categories.filter(cat => this.selectedActivities.has(cat.id)).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === group.categories.length) return 'all';
    return 'some';
  }

  toggleCategoryGroupExpanded(wegezweck: string) {
    if (this.expandedCategoryGroups.has(wegezweck)) {
      this.expandedCategoryGroups.delete(wegezweck);
    } else {
      this.expandedCategoryGroups.add(wegezweck);
    }
  }

  isCategoryGroupExpanded(wegezweck: string): boolean {
    return this.expandedCategoryGroups.has(wegezweck);
  }

  // RegioStar methods with nested selection
  toggleRegioStarGroup(class_name: string) {
    const group = this.groupedRegioStars().find(g => g.class_name === class_name);
    if (!group) return;

    const allSelected = group.regiostars.every(rs => this.selectedRegioStars.has(rs.id));
    
    if (allSelected) {
      // Deselect all in group
      group.regiostars.forEach(rs => this.selectedRegioStars.delete(rs.id));
    } else {
      // Select all in group
      group.regiostars.forEach(rs => this.selectedRegioStars.add(rs.id));
    }
  }

  getRegioStarGroupState(class_name: string): 'all' | 'some' | 'none' {
    const group = this.groupedRegioStars().find(g => g.class_name === class_name);
    if (!group || group.regiostars.length === 0) return 'none';

    const selectedCount = group.regiostars.filter(rs => this.selectedRegioStars.has(rs.id)).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === group.regiostars.length) return 'all';
    return 'some';
  }

  toggleRegioStarGroupExpanded(class_name: string) {
    if (this.expandedRegioStarGroups.has(class_name)) {
      this.expandedRegioStarGroups.delete(class_name);
    } else {
      this.expandedRegioStarGroups.add(class_name);
    }
  }

  isRegioStarGroupExpanded(class_name: string): boolean {
    return this.expandedRegioStarGroups.has(class_name);
  }

  toggleState(id: number) {
    if (this.selectedStates.has(id)) {
      this.selectedStates.delete(id);
    } else {
      this.selectedStates.add(id);
    }
  }

  isActivitySelected(id: number): boolean {
    return this.selectedActivities.has(id);
  }

  isPersonaSelected(id: number): boolean {
    return this.selectedPersonas === id;
  }

  isRegioStarSelected(id: number): boolean {
    return this.selectedRegioStars.has(id);
  }

  isStateSelected(id: number): boolean {
    return this.selectedStates.has(id);
  }

  get activitiesLength(): number {
    return this.activities().length;
  }

  get personasLength(): number {
    return this.personas().length;
  }

  get selectedPersonaCount(): number {
    return this.selectedPersonas !== null ? 1 : 0;
  }

  get regiostarsLength(): number {
    return this.regiostars().length;
  }

  get statesLength(): number {
    return this.states().length;
  }

  selectAllActivities() {
    const activities = this.activities();
    if (this.selectedActivities.size === activities.length) {
      this.selectedActivities.clear();
    } else {
      activities.forEach(activity => this.selectedActivities.add(activity.id));
    }
  }

  // Removed selectAllPersonas - not needed for single select

  selectAllRegioStars() {
    const regiostars = this.regiostars();
    if (this.selectedRegioStars.size === regiostars.length) {
      this.selectedRegioStars.clear();
    } else {
      regiostars.forEach(regiostar => this.selectedRegioStars.add(regiostar.id));
    }
  }

  selectAllCategories() {
    const categories = this.filterConfigService.allCategories();
    if (this.selectedActivities.size === categories.length) {
      this.selectedActivities.clear();
    } else {
      categories.forEach(category => this.selectedActivities.add(category.id));
    }
  }

  get categoriesLength(): number {
    return this.filterConfigService.allCategories().length;
  }

  selectAllStates() {
    const states = this.states();
    if (this.selectedStates.size === states.length) {
      this.selectedStates.clear();
    } else {
      states.forEach(state => this.selectedStates.add(state.id));
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  onApply() {
    this.dialogRef.close({
      selectedActivities: Array.from(this.selectedActivities),
      selectedPersonas: this.selectedPersonas,
      selectedRegioStars: Array.from(this.selectedRegioStars),
      selectedStates: Array.from(this.selectedStates)
    });
  }
}
