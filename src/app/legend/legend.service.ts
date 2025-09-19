import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class LegendService {
    private isPinnedSubject = new BehaviorSubject<boolean>(false);
    private isExpandedSubject = new BehaviorSubject<boolean>(false);
    private isMobileVisibleSubject = new BehaviorSubject<boolean>(false);

    public isPinned$ = this.isPinnedSubject.asObservable();
    public isExpanded$ = this.isExpandedSubject.asObservable();
    public isMobileVisible$ = this.isMobileVisibleSubject.asObservable();

    constructor() { }

    togglePin() {
        this.isPinnedSubject.next(!this.isPinnedSubject.value);
    }

    toggleExpand() {
        this.isExpandedSubject.next(!this.isExpandedSubject.value);
    }

    toggleMobileVisibility() {
        this.isMobileVisibleSubject.next(!this.isMobileVisibleSubject.value);
    }

    hideMobileLegend() {
        this.isMobileVisibleSubject.next(false);
    }

    getIsPinned() {
        return this.isPinnedSubject.value;
    }

    getIsExpanded() {
        return this.isExpandedSubject.value;
    }

    getIsMobileVisible() {
        return this.isMobileVisibleSubject.value;
    }
}