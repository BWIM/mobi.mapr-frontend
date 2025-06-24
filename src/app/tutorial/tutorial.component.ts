import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { TutorialService } from './tutorial.service';
import { TutorialStep, TutorialSet, TutorialConfig } from './tutorial.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tutorial',
  imports: [SharedModule],
  templateUrl: './tutorial.component.html',
  styleUrl: './tutorial.component.css'
})
export class TutorialComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('overlay') overlayRef!: ElementRef;
  @ViewChild('highlightBox') highlightBoxRef!: ElementRef;

  config: TutorialConfig = {
    currentStepIndex: 0,
    isActive: false,
    showOverlay: false
  };
  
  currentStep: TutorialStep | null = null;
  currentSet: TutorialSet | null = null;
  tutorialSets: TutorialSet[] = [];
  
  // Highlight positioning
  highlightStyle: any = {};
  showHighlight = false;
  
  private subscription = new Subscription();

  constructor(private tutorialService: TutorialService) {}

  ngOnInit(): void {
    this.tutorialSets = this.tutorialService.getTutorialSets();
    
    this.subscription.add(
      this.tutorialService.config$.subscribe(config => {
        this.config = config;
        this.currentStep = this.tutorialService.getCurrentStep();
        this.currentSet = this.tutorialService.getCurrentSet();
        
        // Clean up previous click listener
        this.removeTargetElementClickListener();
        
        if (config.isActive && this.currentStep) {
          this.updateHighlight();
          // Add click listener for interactive steps
          if (this.isCurrentStepInteractive()) {
            this.addTargetElementClickListener();
          }
          
          // Handle UI state changes based on current step
          this.handleUIStateChanges();
        } else {
          this.showHighlight = false;
        }
      })
    );
  }

  ngAfterViewInit(): void {
    // Initial highlight update after view is ready
    if (this.config.isActive && this.currentStep) {
      setTimeout(() => this.updateHighlight(), 100);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.removeTargetElementClickListener();
  }

  startTutorial(setId: string): void {
    this.tutorialService.startTutorial(setId);
  }

  nextStep(): void {
    this.tutorialService.nextStep();
  }

  previousStep(): void {
    this.tutorialService.previousStep();
  }

  skipTutorial(): void {
    this.tutorialService.skipTutorial();
  }

  completeTutorial(): void {
    this.tutorialService.completeTutorial();
  }

  isFirstStep(): boolean {
    return this.tutorialService.isFirstStep();
  }

  isLastStep(): boolean {
    return this.tutorialService.isLastStep();
  }

  isCurrentStepInteractive(): boolean {
    return this.tutorialService.isCurrentStepInteractive();
  }

  isStepCompleted(): boolean {
    return this.tutorialService.isStepCompleted();
  }

  isNextButtonDisabled(): boolean {
    return this.isCurrentStepInteractive() && !this.isStepCompleted();
  }

  onTargetElementClick(event?: Event): void {
    if (this.isCurrentStepInteractive() && !this.isStepCompleted()) {
      this.tutorialService.markStepCompleted();
    }
  }

  private updateHighlight(): void {
    if (!this.currentStep || 
        (this.currentStep.type !== 'highlight' && this.currentStep.type !== 'interactive') || 
        !this.currentStep.targetSelector) {
      this.showHighlight = false;
      return;
    }

    // Check if highlight should be shown (defaults to true unless explicitly set to false)
    if (this.currentStep.showHighlight === false) {
      this.showHighlight = false;
      return;
    }

    const targetElement = document.querySelector(this.currentStep.targetSelector);
    if (!targetElement) {
      this.showHighlight = false;
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const overlayRect = this.overlayRef?.nativeElement?.getBoundingClientRect();

    if (!overlayRect) {
      this.showHighlight = false;
      return;
    }

    // Calculate position relative to the overlay
    const left = targetRect.left - overlayRect.left;
    const top = targetRect.top - overlayRect.top;
    const width = targetRect.width;
    const height = targetRect.height;

    this.highlightStyle = {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: '2px solid #3b82f6',
      borderRadius: '4px',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: '1150'
    };

    this.showHighlight = true;
  }

  getInfoBoxPosition(): any {
    if (!this.currentStep || 
        (this.currentStep.type !== 'highlight' && this.currentStep.type !== 'interactive') || 
        !this.currentStep.targetSelector) {
      return {};
    }

    const targetElement = document.querySelector(this.currentStep.targetSelector);
    if (!targetElement) {
      return {};
    }

    const targetRect = targetElement.getBoundingClientRect();
    const overlayRect = this.overlayRef?.nativeElement?.getBoundingClientRect();

    if (!overlayRect) {
      return {};
    }

    const offset = this.currentStep.offset || { x: 0, y: 0 };
    const position = this.currentStep.position || 'bottom';

    let left = targetRect.left - overlayRect.left;
    let top = targetRect.top - overlayRect.top;

    switch (position) {
      case 'top':
        top = top - 120 + offset.y;
        left = left + offset.x;
        break;
      case 'bottom':
        top = top + targetRect.height + 10 + offset.y;
        left = left + offset.x;
        break;
      case 'left':
        left = left - 300 + offset.x;
        top = top + offset.y;
        break;
      case 'right':
        left = left + targetRect.width + 10 + offset.x;
        top = top + offset.y;
        break;
      case 'center':
        // Center the info box over the target element
        left = left + (targetRect.width / 2) - 150 + offset.x; // 300px wide info box
        top = top + (targetRect.height / 2) - 60 + offset.y; // 120px tall info box
        break;
      case 'top-left':
        left = left - 300 + offset.x;
        top = top - 120 + offset.y;
        break;
      case 'top-right':
        left = left + targetRect.width + 10 + offset.x;
        top = top - 120 + offset.y;
        break;
      case 'global-center':
        left = window.innerWidth / 2 - 150 + offset.x;
        top = window.innerHeight / 2 - 60 + offset.y;
        break;
    }

    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: '1151'
    };
  }

  private addTargetElementClickListener(): void {
    if (!this.currentStep?.targetSelector) return;

    const targetElement = document.querySelector(this.currentStep.targetSelector);
    if (targetElement) {
      targetElement.addEventListener('click', this.onTargetElementClick.bind(this));
    }
  }

  private removeTargetElementClickListener(): void {
    if (!this.currentStep?.targetSelector) return;
    
    const targetElement = document.querySelector(this.currentStep.targetSelector);
    if (targetElement) {
      targetElement.removeEventListener('click', this.onTargetElementClick.bind(this));
    }
  }

  private handleUIStateChanges(): void {
    if (!this.currentStep) return;
    
    // Collapse legend after legend step (dashboard-5) when moving to next step
    if (this.currentStep.id === 'dashboard-6') {
      setTimeout(() => {
        this.collapseLegend();
      }, 1000);
    }
    
    // Close details sidebar before map step (dashboard-7)
    if (this.currentStep.id === 'dashboard-7') {
      this.closeDetailsSidebar();
    }
  }

  private collapseLegend(): void {
    // Find and collapse the legend element
    const legendElement = document.querySelector('#legend');
    if (legendElement) {
      // click on the legend element
      (legendElement as HTMLElement).click();
    }
  }

  private closeDetailsSidebar(): void {
    // Find and close the details sidebar
    const detailsSidebar = document.querySelector('.details-sidebar .p-dialog-close-button');
    if (detailsSidebar) {
        (detailsSidebar as HTMLElement).click();
    }
  }
}
