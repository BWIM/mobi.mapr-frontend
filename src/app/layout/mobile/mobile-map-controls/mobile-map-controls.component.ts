import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { MobileUiService } from '../../../services/mobile-ui.service';

@Component({
  selector: 'app-mobile-map-controls',
  imports: [MatIcon, TranslateModule],
  templateUrl: './mobile-map-controls.component.html',
})
export class MobileMapControlsComponent {
  private mobileUi = inject(MobileUiService);

  openStats(): void {
    this.mobileUi.openStats();
  }
}
