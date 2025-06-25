import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class LegendService {
    private isPinnedSubject = new BehaviorSubject<boolean>(false);
    private isExpandedSubject = new BehaviorSubject<boolean>(false);

    public isPinned$ = this.isPinnedSubject.asObservable();
    public isExpanded$ = this.isExpandedSubject.asObservable();

    constructor() { }

    togglePin() {
        this.isPinnedSubject.next(!this.isPinnedSubject.value);
    }

    toggleExpand() {
        this.isExpandedSubject.next(!this.isExpandedSubject.value);
    }

    getIsPinned() {
        return this.isPinnedSubject.value;
    }

    getIsExpanded() {
        return this.isExpandedSubject.value;
    }
}