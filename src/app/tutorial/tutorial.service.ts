import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { TutorialStep, TutorialSet, TutorialConfig } from './tutorial.interface';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class TutorialService {
  private configSubject = new BehaviorSubject<TutorialConfig>({
    currentStepIndex: 0,
    isActive: false,
    showOverlay: false,
    stepCompleted: false
  });

  private tutorialSets: TutorialSet[] = [
    {
      id: 'dashboard',
      name: 'TUTORIAL.DASHBOARD.NAME',
      description: 'TUTORIAL.DASHBOARD.DESCRIPTION',
      steps: [
        {
          id: 'dashboard-1',
          title: 'TUTORIAL.DASHBOARD.STEP1.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP1.CONTENT',
          type: 'informative'
        },
        {
          id: 'dashboard-2',
          title: 'TUTORIAL.DASHBOARD.STEP2.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP2.CONTENT',
          type: 'highlight',
          targetSelector: '#projects-sidebar',
          position: 'right',
          offset: { x: 0, y: 10 }
        },
        {
          id: 'dashboard-3',
          title: 'TUTORIAL.DASHBOARD.STEP3.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP3.CONTENT',
          type: 'interactive',
          targetSelector: '[data-tutorial-target="show-results-btn"]:first-of-type',
          position: 'right',
          offset: { x: 10, y: 0 },
          interactive: true
        },
        {
          id: 'dashboard-4',
          title: 'TUTORIAL.DASHBOARD.STEP4.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP4.CONTENT',
          type: 'informative',
          targetSelector: '#map-container'
        },
        {
          id: 'dashboard-5',
          title: 'TUTORIAL.DASHBOARD.STEP5.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP5.CONTENT',
          type: 'interactive',
          targetSelector: '#legend',
          position: 'right',
          offset: { x: 0, y: 0 },
          interactive: true,
          requireMapFeatureClick: false
        },
        {
          id: 'dashboard-5-1',
          title: 'TUTORIAL.SHARE.STEP3-1.TITLE',
          content: 'TUTORIAL.SHARE.STEP3-1.CONTENT',
          type: 'interactive',
          targetSelector: '#legend-full',
          position: 'top',
          offset: { x: 0, y: 0 },
          interactive: true,
          showHighlight: false,
          requireMapFeatureClick: false
        },
        {
          id: 'dashboard-6',
          title: 'TUTORIAL.DASHBOARD.STEP6.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP6.CONTENT',
          type: 'highlight',
          targetSelector: '.details-sidebar .p-dialog-content',
          position: 'global-top-right',
          offset: { x: -10, y: 0 }
        },
        {
          id: 'dashboard-7',
          title: 'TUTORIAL.DASHBOARD.STEP7.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP7.CONTENT',
          type: 'interactive',
          targetSelector: '#map-container',
          offset: { x: 20, y: 20 },
          position: 'global-top-left',
          interactive: true,
          showHighlight: false,
          requireMapFeatureClick: true
        },
        {
          id: 'dashboard-8',
          title: 'TUTORIAL.DASHBOARD.STEP8.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP8.CONTENT',
          type: 'interactive',
          targetSelector: '.analyze-dialog .p-dialog-close-button',
          offset: { x: 0, y: 0 },
          position: 'bottom',
          showHighlight: false,
          interactive: true,
          requireMapFeatureClick: false
        },
        {
          id: 'dashboard-9',
          title: 'TUTORIAL.DASHBOARD.STEP9.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP9.CONTENT',
          type: 'interactive',
          targetSelector: '#projects-sidebar-tab',
          position: 'right',
          offset: { x: 0, y: 10 },
          interactive: true,
          requireMapFeatureClick: false
        },
        {
          id: 'dashboard-10',
          title: 'TUTORIAL.DASHBOARD.STEP10.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP10.CONTENT',
          type: 'interactive',
          targetSelector: '#credits-sidebar .p-speeddial-button',
          position: 'global-center',
          offset: { x: 0, y: 0 },
          interactive: true,
          requireMapFeatureClick: false
        },
        {
          id: 'dashboard-11',
          title: 'TUTORIAL.DASHBOARD.STEP11.TITLE',
          content: 'TUTORIAL.DASHBOARD.STEP11.CONTENT',
          type: 'informative',
        }
      ]
    },
    {
      id: 'share',
      name: 'TUTORIAL.SHARE.NAME',
      description: 'TUTORIAL.SHARE.DESCRIPTION',
      steps: [ {
        id: 'share-1',
        title: 'TUTORIAL.SHARE.STEP1.TITLE',
        content: 'TUTORIAL.SHARE.STEP1.CONTENT',
        type: 'informative'
      },
      {
        id: 'share-2',
        title: 'TUTORIAL.SHARE.STEP2.TITLE',
        content: 'TUTORIAL.SHARE.STEP2.CONTENT',
        type: 'informative',
        targetSelector: '#map-container'
      },
      {
        id: 'share-3',
        title: 'TUTORIAL.SHARE.STEP3.TITLE',
        content: 'TUTORIAL.SHARE.STEP3.CONTENT',
        type: 'interactive',
        targetSelector: '#legend',
        position: 'right',
        offset: { x: 0, y: 0 },
        interactive: true,
        requireMapFeatureClick: false
      },
      {
        id: 'share-3-1',
        title: 'TUTORIAL.SHARE.STEP3-1.TITLE',
        content: 'TUTORIAL.SHARE.STEP3-1.CONTENT',
        type: 'interactive',
        targetSelector: '#legend-full',
        position: 'top',
        offset: { x: 0, y: 0 },
        interactive: true,
        showHighlight: false,
        requireMapFeatureClick: false
      },{
        id: 'share-4',
        title: 'TUTORIAL.SHARE.STEP4.TITLE',
        content: 'TUTORIAL.SHARE.STEP4.CONTENT',
        type: 'highlight',
        targetSelector: '.share-sidebar .p-dialog-content',
        position: 'top',
        offset: { x: 0, y: -50 }
      },
      {
        id: 'share-5',
        title: 'TUTORIAL.SHARE.STEP5.TITLE',
        content: 'TUTORIAL.SHARE.STEP5.CONTENT',
        type: 'interactive',
        targetSelector: '#map-container',
        offset: { x: 20, y: 20 },
        position: 'global-top-left',
        interactive: true,
        showHighlight: false,
        requireMapFeatureClick: true
      },
      {
        id: 'share-6',
        title: 'TUTORIAL.SHARE.STEP6.TITLE',
        content: 'TUTORIAL.SHARE.STEP6.CONTENT',
        type: 'interactive',
        targetSelector: '.analyze-dialog .p-dialog-close-button',
        offset: { x: 0, y: 0 },
        position: 'bottom',
        showHighlight: false,
        interactive: true,
        requireMapFeatureClick: false
      },{
        id: 'share-7',
        title: 'TUTORIAL.SHARE.STEP7.TITLE',
        content: 'TUTORIAL.SHARE.STEP7.CONTENT',
        type: 'interactive',
        targetSelector: '#credits-sidebar .p-speeddial-button',
        position: 'global-center',
        offset: { x: 0, y: 0 },
        interactive: true,
        requireMapFeatureClick: false
      },
      {
        id: 'share-8',
        title: 'TUTORIAL.SHARE.STEP8.TITLE',
        content: 'TUTORIAL.SHARE.STEP8.CONTENT',
        type: 'informative',
      }
    ]
    }
  ];

  constructor(private http: HttpClient) {}

  get config$(): Observable<TutorialConfig> {
    return this.configSubject.asObservable();
  }

  get config(): TutorialConfig {
    return this.configSubject.value;
  }

  getTutorialSets(): TutorialSet[] {
    return this.tutorialSets;
  }

  getTutorialSet(setId: string): TutorialSet | undefined {
    return this.tutorialSets.find(set => set.id === setId);
  }

  startTutorial(setId: string): void {
    const set = this.getTutorialSet(setId);
    if (set) {
      this.configSubject.next({
        currentSetId: setId,
        currentStepIndex: 0,
        isActive: true,
        showOverlay: true,
        stepCompleted: false
      });
    }
  }

  nextStep(): void {
    const currentConfig = this.config;
    const currentSet = this.getTutorialSet(currentConfig.currentSetId!);
    
    if (currentSet && currentConfig.currentStepIndex < currentSet.steps.length - 1) {
      this.configSubject.next({
        ...currentConfig,
        currentStepIndex: currentConfig.currentStepIndex + 1,
        stepCompleted: false
      });
    } else {
      this.completeTutorial();
    }
  }

  previousStep(): void {
    const currentConfig = this.config;
    if (currentConfig.currentStepIndex > 0) {
      this.configSubject.next({
        ...currentConfig,
        currentStepIndex: currentConfig.currentStepIndex - 1,
        stepCompleted: false
      });
    }
  }

  completeTutorial(): void {
    this.configSubject.next({
      currentSetId: undefined,
      currentStepIndex: 0,
      isActive: false,
      showOverlay: false,
      stepCompleted: false
    });
    this.http.get<void>(`${environment.apiUrl}/permissions/complete-tutorial/`).subscribe();
  }

  skipTutorial(): void {
    this.completeTutorial();
  }

  getCurrentStep(): TutorialStep | null {
    const currentConfig = this.config;
    const currentSet = this.getTutorialSet(currentConfig.currentSetId!);
    
    if (currentSet && currentConfig.currentStepIndex < currentSet.steps.length) {
      return currentSet.steps[currentConfig.currentStepIndex];
    }
    return null;
  }

  getCurrentSet(): TutorialSet | null {
    const currentConfig = this.config;
    return this.getTutorialSet(currentConfig.currentSetId!) || null;
  }

  isFirstStep(): boolean {
    return this.config.currentStepIndex === 0;
  }

  isLastStep(): boolean {
    const currentConfig = this.config;
    const currentSet = this.getTutorialSet(currentConfig.currentSetId!);
    return currentSet ? currentConfig.currentStepIndex === currentSet.steps.length - 1 : true;
  }

  markStepCompleted(): void {
    const currentConfig = this.config;
    const currentStep = this.getCurrentStep();
    
    // For interactive steps, automatically advance to next step
    if (currentStep?.interactive) {
      const currentSet = this.getTutorialSet(currentConfig.currentSetId!);
      
      if (currentSet && currentConfig.currentStepIndex < currentSet.steps.length - 1) {
        this.configSubject.next({
          ...currentConfig,
          currentStepIndex: currentConfig.currentStepIndex + 1,
          stepCompleted: false
        });
      } else {
        this.completeTutorial();
      }
    } else {
      // For non-interactive steps, just mark as completed
      this.configSubject.next({
        ...currentConfig,
        stepCompleted: true
      });
    }
  }

  isCurrentStepInteractive(): boolean {
    const currentStep = this.getCurrentStep();
    return currentStep?.interactive === true;
  }

  isStepCompleted(): boolean {
    return this.config.stepCompleted || false;
  }

  getTutorialStatus(): Observable<boolean> {
    // make a call to the backend to get the tutorial status
    return this.http.get<boolean>(`${environment.apiUrl}/permissions/tutorial/`)
  }
}