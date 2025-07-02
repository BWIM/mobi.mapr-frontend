import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CreditsService {
  private isExpandedSubject = new BehaviorSubject<boolean>(false);
  isExpanded$ = this.isExpandedSubject.asObservable();

  toggleCredits() {
    this.isExpandedSubject.next(!this.isExpandedSubject.value);
  }

  showCredits() {
    this.isExpandedSubject.next(true);
  }

  hideCredits() {
    this.isExpandedSubject.next(false);
  }

  getCreditsDialog(): boolean {
    return this.isExpandedSubject.value;
  } 
}