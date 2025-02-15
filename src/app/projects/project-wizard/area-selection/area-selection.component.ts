import { Component, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../../shared/shared.module';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AreasService } from '../../../services/areas.service';
import { Area } from '../../../services/interfaces/area.interface';

@Component({
  selector: 'app-area-selection',
  templateUrl: './area-selection.component.html',
  styleUrls: ['./area-selection.component.css'],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AreaSelectionComponent),
      multi: true
    }
  ]
})
export class AreaSelectionComponent implements OnInit, ControlValueAccessor {
  areas: Area[] = [];
  selectedAreaIds: number[] = [];
  areaForm: FormGroup;
  isDisabled = false;

  // ControlValueAccessor Callbacks
  private onChange: (value: number[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private areasService: AreasService,
    private fb: FormBuilder
  ) {
    this.areaForm = this.fb.group({
      selectedAreas: [[], Validators.required]
    });

    // Wenn sich die Auswahl ändert, informiere den Parent
    this.areaForm.get('selectedAreas')?.valueChanges.subscribe(areas => {
      this.selectedAreaIds = areas.map((area: Area) => area.id);
      this.onChange(this.selectedAreaIds);
      this.onTouched();
    });
  }

  ngOnInit() {
    this.loadAreas();
  }

  private loadAreas() {
    this.areasService.getAreas().subscribe({
      next: (areas) => {
        this.areas = areas;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Gebiete:', error);
      }
    });
  }

  // ControlValueAccessor Interface Implementierung
  writeValue(value: number[]): void {
    if (value) {
      this.selectedAreaIds = value;
      const selectedAreas = this.areas.filter(area => value.includes(area.id));
      this.areaForm.get('selectedAreas')?.setValue(selectedAreas, { emitEvent: false });
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (isDisabled) {
      this.areaForm.disable();
    } else {
      this.areaForm.enable();
    }
  }
} 