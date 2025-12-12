import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SharedModule } from '../shared/shared.module';
import { LegendService } from './legend.service';
import { MapV2Service } from '../map-v2/map-v2.service';
import { Project, ProjectInfo } from '../projects/project.interface';
import { ProjectsService } from '../projects/projects.service';

type ScoreLevel = {
  name: string;
  description: string;
  descriptionMobile: string;
  min: number;
  max: number;
};

@Component({
  selector: 'app-legend',
  templateUrl: './legend.component.html',
  styleUrls: ['./legend.component.scss'],
  standalone: true,
  imports: [CommonModule, SharedModule]
})
export class LegendComponent implements OnInit, OnDestroy {

  private langChangeSubscription!: Subscription;
  private projectDataSubscription!: Subscription;
  private projectInfoSubscription!: Subscription;
  private visualizationTypeSubscription!: Subscription;
  isPinned: boolean = false;
  isExpanded: boolean = false;
  isMobileVisible: boolean = false;
  isDifferenceMap: boolean = false;
  isScoreVisualization: boolean = false;
  currentProjectData: Project | null = null;
  currentProjectInfo: ProjectInfo | null = null;
  differenceHeader: string = '';
  scoreHeader: string = '';

  constructor(
    private translate: TranslateService,
    private legendService: LegendService,
    private mapService: MapV2Service,
    private projectsService: ProjectsService
  ) { }

  scoreLevel?: ScoreLevel;
  sliderElementId: string = 'slider';
  defaultValues = [83, 72, 57, 42, 27].reverse();

  scoreLevels: ScoreLevel[] = [];

  togglePin() {
    this.legendService.togglePin();
  }

  toggleExpand() {
    this.legendService.toggleExpand();
  }

  toggleMobileVisibility() {
    this.legendService.toggleMobileVisibility();
  }

  ngOnInit() {
    this.initializeScoreLevels();
    this.loadDifferenceHeader();
    this.loadScoreHeader();

    // Listen for language changes and update translations
    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.initializeScoreLevels();
      this.loadDifferenceHeader();
      this.loadScoreHeader();
    });

    this.legendService.isPinned$.subscribe((pinned) => {
      this.isPinned = pinned;
    });

    this.legendService.isExpanded$.subscribe((expanded) => {
      this.isExpanded = expanded;
    });

    this.legendService.isMobileVisible$.subscribe((visible) => {
      this.isMobileVisible = visible;
    });

    // Subscribe to project data to check if it's a difference map
    this.projectDataSubscription = this.mapService.getCurrentProjectData$.subscribe(projectData => {
      this.currentProjectData = projectData;
      this.isDifferenceMap = projectData?.difference === true;
    });

    // Subscribe to visualization type changes
    this.isScoreVisualization = this.mapService.getVisualizationType() === 'score';
    this.visualizationTypeSubscription = this.mapService.visualizationType$.subscribe(type => {
      this.isScoreVisualization = type === 'score';
    });

    // Subscribe to project info to get project names for difference maps
    // Get initial value immediately
    this.currentProjectInfo = this.projectsService.getCurrentProjectInfo();
    this.projectInfoSubscription = this.projectsService.currentProjectInfo$.subscribe(projectInfo => {
      this.currentProjectInfo = projectInfo;
    });
  }

  ngOnDestroy() {
    // Clean up the subscription when the component is destroyed
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
    if (this.projectDataSubscription) {
      this.projectDataSubscription.unsubscribe();
    }
    if (this.projectInfoSubscription) {
      this.projectInfoSubscription.unsubscribe();
    }
    if (this.visualizationTypeSubscription) {
      this.visualizationTypeSubscription.unsubscribe();
    }
  }

  initializeScoreLevels() {
    const defaultValues = this.defaultValues;

    this.translate.get(['LEGEND.LVLA', 'LEGEND.LVLB', 'LEGEND.LVLC', 'LEGEND.LVLD', 'LEGEND.LVLE', 'LEGEND.LVLF']).subscribe(translations => {
      this.scoreLevels = [
        {
          name: 'A',
          description: translations['LEGEND.LVLA'],
          descriptionMobile: "<35%",
          min: defaultValues[4],
          max: 100
        },
        {
          name: 'B',
          description: translations['LEGEND.LVLB'],
          descriptionMobile: "35-50%",
          min: defaultValues[3],
          max: defaultValues[4]
        },
        {
          name: 'C',
          description: translations['LEGEND.LVLC'],
          descriptionMobile: "51-71%",
          min: defaultValues[2],
          max: defaultValues[3]
        },
        {
          name: 'D',
          description: translations['LEGEND.LVLD'],
          descriptionMobile: "72-100%",
          min: defaultValues[1],
          max: defaultValues[2]
        },
        {
          name: 'E',
          description: translations['LEGEND.LVLE'],
          descriptionMobile: "101-140%",
          min: defaultValues[0],
          max: defaultValues[1]
        },
        {
          name: 'F',
          description: translations['LEGEND.LVLF'],
          descriptionMobile: ">141%",
          min: 0,
          max: defaultValues[0]
        }
      ];
    });
  }

  loadDifferenceHeader() {
    this.translate.get('LEGEND.DIFFERENCE_HEADER').subscribe(translation => {
      this.differenceHeader = translation;
    });
  }

  loadScoreHeader() {
    this.translate.get('LEGEND.SCORE_HEADER').subscribe(translation => {
      this.scoreHeader = translation;
    });
  }

  getVisualizationType(): 'index' | 'score' {
    return this.mapService.getVisualizationType();
  }
}
