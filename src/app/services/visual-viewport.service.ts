import { Injectable, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class VisualViewportService implements OnDestroy {
  private initialized = false;
  private readonly updateInset = (): void => {
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--browser-ui-bottom', `${inset}px`);
  };

  init(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }
    this.initialized = true;

    const vv = window.visualViewport;
    if (!vv) {
      return;
    }

    vv.addEventListener('resize', this.updateInset);
    vv.addEventListener('scroll', this.updateInset);
    this.updateInset();
  }

  ngOnDestroy(): void {
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    vv.removeEventListener('resize', this.updateInset);
    vv.removeEventListener('scroll', this.updateInset);
  }
}
