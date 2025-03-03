import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { TranslateService } from '@ngx-translate/core';
import { SharedModule } from './shared/shared.module';
import { ProjectWizardComponent } from './projects/project-wizard/project-wizard.component';
import { AnalyzeComponent } from './analyze/analyze.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MenubarModule, ButtonModule, SharedModule, ProjectWizardComponent, AnalyzeComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'mobi.mapr-frontend-2.0';

  constructor(private translate: TranslateService) {
    translate.setDefaultLang('de');
    translate.use('de');
  }
}
