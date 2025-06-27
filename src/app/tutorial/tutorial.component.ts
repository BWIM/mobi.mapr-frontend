import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { TutorialService } from './tutorial.service';
import { TutorialStep, TutorialSet, TutorialConfig } from './tutorial.interface';
import { Subscription } from 'rxjs';
import { LegendService } from '../legend/legend.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { ShareService } from '../share/share.service';
import { MapV2Service } from '../map-v2/map-v2.service';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-tutorial',
  imports: [SharedModule, DialogModule],
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
  
  // Language selection properties
  showLanguageDialog = false;
  currentLang = 'de';
  private readonly LANGUAGE_KEY = 'mobi.mapr.language';

  languages = [
    { code: 'de', name: 'Deutsch' },
    { code: 'de-bw', name: 'Badisch' },
    { code: 'de-sw', name: 'Schwäbisch' },
    { code: 'en', name: 'English' }
  ];
  
  // Highlight positioning
  highlightStyle: any = {};
  showHighlight = false;
  
  private subscription = new Subscription();
  private mapFeatureClickHandler: ((event: any) => void) | null = null;

  constructor(
    private tutorialService: TutorialService, 
    private legendService: LegendService, 
    private dashboardService: DashboardService, 
    private shareService: ShareService, 
    private mapV2Service: MapV2Service,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.tutorialSets = this.tutorialService.getTutorialSets();
    this.loadLanguagePreference();
    
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

    // Subscribe to language changes to refresh tutorial texts
    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        // Force change detection to update translated texts
        this.cdr.detectChanges();
      })
    );
  }

  private loadLanguagePreference(): void {
    const savedLang = localStorage.getItem(this.LANGUAGE_KEY);
    if (savedLang) {
      this.currentLang = savedLang;
      this.translate.use(savedLang);
    } else {
      this.translate.setDefaultLang('de');
      this.translate.use('de');
    }
  }

  switchLanguage(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem(this.LANGUAGE_KEY, lang);
    this.showLanguageDialog = false;
    
    // Force change detection to update all translated texts immediately
    this.cdr.detectChanges();
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
    this.removeMapFeatureClickListener();
  }

  startTutorial(setId: string): void {
    this.tutorialService.startTutorial(setId);
  }

  nextStep(): void {
    console.log('nextStep');
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
    console.log('onTargetElementClick', this.currentStep);
    if (this.isCurrentStepInteractive() && !this.isStepCompleted()) {
      console.log('onTargetElementClick 2', this.currentStep);
      // Check if this step requires map feature clicks
      // if clicking on the skip button, skip the step
      if (this.currentStep?.requireMapFeatureClick == false) {
        this.tutorialService.markStepCompleted();
      }
    }
  }

  onMapFeatureClick(): void {
    if (this.isCurrentStepInteractive() && !this.isStepCompleted() && this.currentStep?.requireMapFeatureClick) {
      setTimeout(() => {
        this.tutorialService.markStepCompleted();
      }, 10);
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
      // If element doesn't exist and we need to show highlight, poll for it
      if (this.currentStep.showHighlight === undefined || this.currentStep.showHighlight === true) {
        this.pollForHighlightElement();
      }
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

  private pollForHighlightElement(): void {
    if (!this.currentStep?.targetSelector) return;

    const maxAttempts = 50; // 5 seconds with 100ms intervals
    let attempts = 0;
    const targetSelector = this.currentStep.targetSelector;

    const pollInterval = setInterval(() => {
      attempts++;
      const targetElement = document.querySelector(targetSelector);
      
      if (targetElement) {
        clearInterval(pollInterval);
        // Update highlight after element is found
        setTimeout(() => this.updateHighlight(), 50);
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.warn(`Highlight target element not found after ${maxAttempts} attempts: ${targetSelector}`);
      }
    }, 100);
  }

  getInfoBoxPosition(): any {
    if (!this.currentStep || 
        (this.currentStep.type !== 'highlight' && this.currentStep.type !== 'interactive') || 
        !this.currentStep.targetSelector) {
      return {};
    }

    const targetElement = document.querySelector(this.currentStep.infoBoxSelector || this.currentStep.targetSelector);
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
      case 'global-top-left':
        left = 50 + offset.x;
        top = 50 + offset.y;
        break;
      case 'global-top-right':
        left = window.innerWidth - 300 + offset.x;
        top = 10 + offset.y;
        break;
      case 'global-bottom-right':
        left = window.innerWidth - 300 + offset.x;
        top = window.innerHeight - 300 + offset.y;
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

    // Try to find the target element immediately
    let targetElement = document.querySelector(this.currentStep.targetSelector);
    
    if (targetElement) {
      // Element exists, add listener immediately
      targetElement.addEventListener('click', this.onTargetElementClick.bind(this));
    } else {
      // Element doesn't exist yet, poll for it
      this.pollForTargetElement();
    }

    // Set up map feature click listener if this step requires it
    if (this.currentStep.requireMapFeatureClick) {
      this.setupMapFeatureClickListener();
    }
  }

  private pollForTargetElement(): void {
    if (!this.currentStep?.targetSelector) return;

    const maxAttempts = 50; // 5 seconds with 100ms intervals
    let attempts = 0;
    const targetSelector = this.currentStep.targetSelector;

    const pollInterval = setInterval(() => {
      attempts++;
      const targetElement = document.querySelector(targetSelector);
      
      if (targetElement) {
        clearInterval(pollInterval);
        targetElement.addEventListener('click', this.onTargetElementClick.bind(this));
        // Update highlight after element is found
        setTimeout(() => this.updateHighlight(), 50);
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.warn(`Target element not found after ${maxAttempts} attempts: ${targetSelector}`);
      }
    }, 100);
  }

  private removeTargetElementClickListener(): void {
    if (!this.currentStep?.targetSelector) return;
    
    const targetElement = document.querySelector(this.currentStep.targetSelector);
    if (targetElement) {
      targetElement.removeEventListener('click', this.onTargetElementClick.bind(this));
    }

    // Remove map feature click listener if it was set up
    if (this.currentStep.requireMapFeatureClick) {
      this.removeMapFeatureClickListener();
    }
  }

  private handleUIStateChanges(): void {
    if (!this.currentStep) return;

    if (this.currentStep.id === 'share-2') {
      this.shareService.toggleRightSidebarExpanded();
    }

    if (this.currentStep.id === 'share-4') {
      this.shareService.toggleRightSidebarExpanded();
    }

    if (this.currentStep.id === 'share-5') {
      this.shareService.toggleRightSidebarExpanded();
    }

    if (this.currentStep.id === 'dashboard-4') {
      setTimeout(() => {
        this.dashboardService.toggleRightSidebarExpanded();
      }, 10);
    }

    if (this.currentStep.id === 'dashboard-6') {
      this.dashboardService.toggleRightSidebarExpanded();;
    }

    // Close details sidebar before map step (dashboard-7)
    if (this.currentStep.id === 'dashboard-7') {
      setTimeout(() => {
        this.dashboardService.toggleRightSidebarExpanded();
      }, 10);
    }

  }

  private setupMapFeatureClickListener(): void {
    const map = this.mapV2Service.getMap();
    if (map) {
      // Store the bound function so we can remove it later
      this.mapFeatureClickHandler = this.onMapFeatureClick.bind(this);
      map.on('click', 'geodata-fill', this.mapFeatureClickHandler);
    }
  }

  private removeMapFeatureClickListener(): void {
    const map = this.mapV2Service.getMap();
    if (map && this.mapFeatureClickHandler) {
      map.off('click', 'geodata-fill', this.mapFeatureClickHandler);
      this.mapFeatureClickHandler = null;
    }
  }

}
