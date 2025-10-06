import { Component } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-tutorial',
  imports: [SharedModule, DialogModule],
  templateUrl: './tutorial.component.html',
  styleUrl: './tutorial.component.css'
})
export class TutorialComponent {




}
