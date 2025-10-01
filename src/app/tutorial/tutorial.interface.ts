export interface TutorialStep {
  id: string;
  title: string;
  content: string;
  type: 'informative' | 'highlight' | 'picture';
  targetSelector?: string; // CSS selector for the element to highlight
  infoBoxSelector?: string; // CSS selector for the element to position info box
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'top-left' | 'top-right' | 'global-center' | 'global-top' | 'global-top-left' | 'global-top-right' | 'global-bottom-right' | 'global-top-center'; // Position of the info box relative to target
  offset?: { x: number; y: number }; // Offset from the target element
  showHighlight?: boolean; // Whether to show the blue highlight box (defaults to true for highlight)
  imageUrl?: string; // URL for picture display mode
  languageHint?: string; // Hint for the language
}

export interface TutorialSet {
  id: string;
  name: string;
  description: string;
  steps: TutorialStep[];
}

export interface TutorialConfig {
  currentSetId?: string;
  currentStepIndex: number;
  isActive: boolean;
  showOverlay: boolean;
  stepCompleted?: boolean; // Track if current step is completed
}
