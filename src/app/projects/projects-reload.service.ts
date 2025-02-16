import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProjectsReloadService {
  private reloadSubject = new Subject<void>();
  reload$ = this.reloadSubject.asObservable();

  triggerReload(): void {
    this.reloadSubject.next();
  }
} 