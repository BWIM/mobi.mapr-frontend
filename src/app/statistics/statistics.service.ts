import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private _visible = new BehaviorSubject<boolean>(false);
  visible$ = this._visible.asObservable();

  constructor() { }

  get visible(): boolean {
    return this._visible.value;
  }

  set visible(value: boolean) {
    this._visible.next(value);
  }
}
