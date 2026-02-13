import { Component, signal } from '@angular/core';
import { RailComponent } from '../rail/rail.component';
import { LeftComponent } from '../left/left.component';
import { RightComponent } from '../right/right.component';
import { CenterComponent } from '../center/center.component';
import { BottomComponent } from '../bottom/bottom.component';

@Component({
  selector: 'app-dashboard',
  imports: [RailComponent, LeftComponent, RightComponent, CenterComponent, BottomComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  leftPanelExpanded = signal(true);
  rightPanelExpanded = signal(true);

  toggleLeftPanel() {
    this.leftPanelExpanded.update(value => !value);
  }

  toggleRightPanel() {
    this.rightPanelExpanded.update(value => !value);
  }
}
