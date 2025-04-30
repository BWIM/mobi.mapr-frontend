import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService } from './statistics.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css'
})
export class StatisticsComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  private subscription: Subscription;

  constructor(private statisticsService: StatisticsService) {
    this.subscription = this.statisticsService.visible$.subscribe(
      visible => this.visible = visible
    );
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
