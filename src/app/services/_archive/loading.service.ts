import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  private loadingCounter = 0;

  startLoading(): void {

    this.loadingCounter++;
    if (this.loadingCounter === 1) {
      this.loadingSubject.next(true);
    }
  }

  stopLoading(): void {
    this.loadingCounter--;
    if (this.loadingCounter === 0) {
      this.loadingSubject.next(false);
    }
  }

  stopLoadingAndReset(): void {
    this.loadingCounter = 0;
    this.loadingSubject.next(false);
  }
} 