import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private legendExpandedSubject = new BehaviorSubject<boolean>(false);
  private rightSidebarExpandedSubject = new BehaviorSubject<boolean>(false);
  private leftSidebarExpandedSubject = new BehaviorSubject<boolean>(false);
  public legendExpanded$ = this.legendExpandedSubject.asObservable();
  public rightSidebarExpanded$ = this.rightSidebarExpandedSubject.asObservable();
  public leftSidebarExpanded$ = this.leftSidebarExpandedSubject.asObservable();

  constructor() { }

  toggleLegendExpanded(): void {
    this.legendExpandedSubject.next(!this.legendExpandedSubject.value);
  }

  setLegendExpanded(expanded: boolean): void {
    this.legendExpandedSubject.next(expanded);
  }

  getLegendExpanded(): boolean {
    return this.legendExpandedSubject.value;
  }


  setRightSidebarExpanded(expanded: boolean): void {
    this.rightSidebarExpandedSubject.next(expanded);
  }

  getRightSidebarExpanded(): boolean {
    return this.rightSidebarExpandedSubject.value;
  }

  isRightSidebarExpanded(): boolean {
    return this.rightSidebarExpandedSubject.value;
  }

  toggleRightSidebarExpanded(): void {
    this.rightSidebarExpandedSubject.next(!this.rightSidebarExpandedSubject.value);
  }

  toggleLeftSidebarExpanded(): void {
    this.leftSidebarExpandedSubject.next(!this.leftSidebarExpandedSubject.value);
  }

  getLeftSidebarExpanded(): boolean {
    return this.leftSidebarExpandedSubject.value;
  }

  setLeftSidebarExpanded(expanded: boolean): void {
    this.leftSidebarExpandedSubject.next(expanded);
  }
} 