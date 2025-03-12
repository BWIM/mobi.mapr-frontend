import {Component, OnDestroy, OnInit} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {Subscription} from 'rxjs';
import { SharedModule } from '../shared/shared.module';

type ScoreLevel = {
  name: string; 
  description: string; 
  min: number; 
  max: number;
};

@Component({
  selector: 'app-legend',
  templateUrl: './legend.component.html',
  styleUrls: ['./legend.component.scss'],
  standalone: true,
  imports: [SharedModule]
})
export class LegendComponent implements OnInit, OnDestroy {

  private langChangeSubscription!: Subscription;
  isPinned: boolean = false;
  isExpanded: boolean = false;

  constructor(private translate: TranslateService) {}

  scoreLevel?: ScoreLevel;
  sliderElementId: string = 'slider';
  defaultValues = [83, 72, 57, 42, 27].reverse();

  scoreLevels: ScoreLevel[] = [];

  togglePin() {
    this.isPinned = !this.isPinned;
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
  }

  ngOnInit() {
    this.initializeScoreLevels();

    // Listen for language changes and update translations
    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.initializeScoreLevels();
    });
  }

  ngOnDestroy() {
    // Clean up the subscription when the component is destroyed
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
  }

  initializeScoreLevels() {
    const defaultValues = this.defaultValues;

    this.translate.get(['LEGEND.LVLA', 'LEGEND.LVLB', 'LEGEND.LVLC', 'LEGEND.LVLD', 'LEGEND.LVLE', 'LEGEND.LVLF']).subscribe(translations => {
      this.scoreLevels = [
        {
          name: 'A',
          description: translations['LEGEND.LVLA'],
          min: defaultValues[4],
          max: 100
        },
        {
          name: 'B',
          description: translations['LEGEND.LVLB'],
          min: defaultValues[3],
          max: defaultValues[4]
        },
        {
          name: 'C',
          description: translations['LEGEND.LVLC'],
          min: defaultValues[2],
          max: defaultValues[3]
        },
        {
          name: 'D',
          description: translations['LEGEND.LVLD'],
          min: defaultValues[1],
          max: defaultValues[2]
        },
        {
          name: 'E',
          description: translations['LEGEND.LVLE'],
          min: defaultValues[0],
          max: defaultValues[1]
        },
        {
          name: 'F',
          description: translations['LEGEND.LVLF'],
          min: 0,
          max: defaultValues[0]
        }
      ];
    });
  }
}
