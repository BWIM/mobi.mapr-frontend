import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { MenuItem } from 'primeng/api';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProjectsService } from '../projects.service';
import { Router } from '@angular/router';
import { ProjectWizardService } from './project-wizard.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-project-wizard',
  templateUrl: './project-wizard.component.html',
  styleUrls: ['./project-wizard.component.css'],
  standalone: true,
  imports: [SharedModule]
})
export class ProjectWizardComponent implements OnInit, OnDestroy {
  steps: MenuItem[] = [];
  activeIndex: number = 0;
  projectForm: FormGroup;
  visible: boolean = false;
  private subscription: Subscription;

  constructor(
    private fb: FormBuilder,
    private projectsService: ProjectsService,
    private router: Router,
    private wizardService: ProjectWizardService
  ) {
    this.subscription = this.wizardService.visible$.subscribe(
      visible => this.visible = visible
    );

    this.projectForm = this.fb.group({
      // Schritt 1: Grundinformationen
      basicInfo: this.fb.group({
        display_name: ['', Validators.required],
        description: [''],
        projectgroup: ['']
      }),
      // Schritt 2: Projekttyp
      projectType: this.fb.group({
        type: ['', Validators.required]
      }),
      // Schritt 3: Gebiet auswählen
      area: this.fb.group({
        selectedArea: ['', Validators.required]
      }),
      // Schritt 4: Parameter
      parameters: this.fb.group({
        param1: [''],
        param2: ['']
      }),
      // Schritt 5: Zusammenfassung
      summary: this.fb.group({
        confirmed: [false, Validators.requiredTrue]
      })
    });
  }

  ngOnInit() {
    this.initializeSteps();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private initializeSteps() {
    this.steps = [
      {
        label: 'Grundinformationen',
        command: (event: any) => {
          this.activeIndex = 0;
        }
      },
      {
        label: 'Projekttyp',
        command: (event: any) => {
          this.activeIndex = 1;
        }
      },
      {
        label: 'Gebiet auswählen',
        command: (event: any) => {
          this.activeIndex = 2;
        }
      },
      {
        label: 'Parameter',
        command: (event: any) => {
          this.activeIndex = 3;
        }
      },
      {
        label: 'Zusammenfassung',
        command: (event: any) => {
          this.activeIndex = 4;
        }
      }
    ];
  }

  nextStep() {
    if (this.activeIndex < this.steps.length - 1) {
      this.activeIndex++;
    }
  }

  prevStep() {
    if (this.activeIndex > 0) {
      this.activeIndex--;
    }
  }

  hide() {
    this.wizardService.hide();
  }

  onSubmit() {
    if (this.projectForm.valid) {
      const projectData = {
        display_name: this.projectForm.get('basicInfo.display_name')?.value,
        description: this.projectForm.get('basicInfo.description')?.value,
        type: this.projectForm.get('projectType.type')?.value,
        projectgroup: this.projectForm.get('basicInfo.projectgroup')?.value
      };

      this.projectsService.createProject(projectData).subscribe({
        next: (response) => {
          this.hide();
          this.router.navigate(['/projects']);
        },
        error: (error) => {
          console.error('Fehler beim Erstellen des Projekts:', error);
        }
      });
    }
  }
} 