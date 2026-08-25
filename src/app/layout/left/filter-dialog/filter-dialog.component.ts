import { Component, OnInit, Inject, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FilterConfigService } from '../../../services/filter-config.service';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';

export interface FilterDialogData {
  selectedRegioStars: number[];
  selectedStates: number[];
}

@Component({
  selector: 'app-filter-dialog',
  standalone: true,
  imports: [
    SharedModule,
    TranslateModule,
  ],
  templateUrl: './filter-dialog.component.html',
  styleUrl: './filter-dialog.component.css'
})
export class FilterDialogComponent implements OnInit {
  private filterConfigService = inject(FilterConfigService);

  regiostars = this.filterConfigService.allRegioStars;
  groupedRegioStars = this.filterConfigService.groupedRegioStars;
  states = this.filterConfigService.allStates;

  selectedRegioStars: Set<number> = new Set();
  selectedStates: Set<number> = new Set();
  expandedRegioStarGroups: Set<string> = new Set();

  constructor(
    public dialogRef: MatDialogRef<FilterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FilterDialogData
  ) {
    this.selectedRegioStars = new Set(data.selectedRegioStars || []);
    this.selectedStates = new Set(data.selectedStates || []);
  }

  ngOnInit() {
  }

  toggleRegioStar(id: number) {
    if (this.selectedRegioStars.has(id)) {
      this.selectedRegioStars.delete(id);
    } else {
      this.selectedRegioStars.add(id);
    }
  }

  toggleRegioStarGroup(class_name: string) {
    const group = this.groupedRegioStars().find(g => g.class_name === class_name);
    if (!group) return;

    const allSelected = group.regiostars.every(rs => this.selectedRegioStars.has(rs.id));

    if (allSelected) {
      group.regiostars.forEach(rs => this.selectedRegioStars.delete(rs.id));
    } else {
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

  isRegioStarSelected(id: number): boolean {
    return this.selectedRegioStars.has(id);
  }

  isStateSelected(id: number): boolean {
    return this.selectedStates.has(id);
  }

  get regiostarsLength(): number {
    return this.regiostars().length;
  }

  get statesLength(): number {
    return this.states().length;
  }

  selectAllRegioStars() {
    const regiostars = this.regiostars();
    if (this.selectedRegioStars.size === regiostars.length) {
      this.selectedRegioStars.clear();
    } else {
      regiostars.forEach(regiostar => this.selectedRegioStars.add(regiostar.id));
    }
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
      selectedRegioStars: Array.from(this.selectedRegioStars),
      selectedStates: Array.from(this.selectedStates)
    });
  }
}
