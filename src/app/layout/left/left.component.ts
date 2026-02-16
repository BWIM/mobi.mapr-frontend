import { Component } from '@angular/core';
import { ProjectsService } from '../../services/project.service';
import { Project } from '../../interfaces/project';
import { SharedModule } from '../../shared/shared.module';
import { MatDialog } from '@angular/material/dialog';
import { FilterDialogComponent, FilterDialogData } from './filter-dialog/filter-dialog.component';

@Component({
  selector: 'app-left',
  imports: [SharedModule],
  templateUrl: './left.component.html',
  styleUrl: './left.component.css',
})
export class LeftComponent {
  project: Project | null = null;
  isExpanded = false;
  selectedVerkehrsmittel: string[] = [];
  selectedMobilitatsbewertung: string[] = [];
  selectedActivities: number[] = [];
  selectedPersonas: number[] = [];
  selectedRegioStars: number[] = [];
  selectedStates: number[] = [];


  verkehrsmittelOptions = [
    { id: 'walk', icon: 'directions_walk', label: 'Zu Fuß' },
    { id: 'bike', icon: 'directions_bike', label: 'Fahrrad' },
    { id: 'car', icon: 'directions_car', label: 'Auto' },
    { id: 'bus', icon: 'directions_bus', label: 'Bus' }
  ];

  constructor(
    private projectService: ProjectsService,
    private dialog: MatDialog
  ) {
    this.projectService.getProjectById(1).subscribe({
      next: (project) => {
        this.project = project;
      },
      error: (error) => {
        console.error('Error fetching project:', error);
      }
    });
  }

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  toggleVerkehrsmittel(id: string) {
    const index = this.selectedVerkehrsmittel.indexOf(id);
    if (index > -1) {
      this.selectedVerkehrsmittel.splice(index, 1);
    } else {
      this.selectedVerkehrsmittel.push(id);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedVerkehrsmittel.includes(id);
  }

  toggleMobilitatsbewertung(id: string) {
    const index = this.selectedMobilitatsbewertung.indexOf(id);
    if (index > -1) {
      this.selectedMobilitatsbewertung.splice(index, 1);
    } else {
      this.selectedMobilitatsbewertung.push(id);
    }
  }

  isMobilitatsbewertungSelected(id: string): boolean {
    return this.selectedMobilitatsbewertung.includes(id);
  }

  openFilterDialog() {
    const dialogData: FilterDialogData = {
      selectedActivities: this.selectedActivities,
      selectedPersonas: this.selectedPersonas,
      selectedRegioStars: this.selectedRegioStars,
      selectedStates: this.selectedStates
    };

    const dialogRef = this.dialog.open(FilterDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.selectedActivities = result.selectedActivities || [];
        this.selectedPersonas = result.selectedPersonas || [];
        this.selectedRegioStars = result.selectedRegioStars || [];
        this.selectedStates = result.selectedStates || [];
      }
    });
  }
}
