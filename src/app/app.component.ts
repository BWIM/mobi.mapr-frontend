import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { TranslateService } from '@ngx-translate/core';
import { SharedModule } from './shared/shared.module';
import { ProjectWizardComponent } from './projects/project-wizard/project-wizard.component';
import { AnalyzeComponent } from './analyze/analyze.component';
import { CreditsComponent } from './credits/credits.component';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MenubarModule, ButtonModule, SharedModule, ProjectWizardComponent, AnalyzeComponent, CreditsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'mobi.mapr-frontend-2.0';
  isLoggedIn: boolean = false;

  constructor(private translate: TranslateService, private authService: AuthService) {
    translate.setDefaultLang('de');
    translate.use('de');
    this.isLoggedIn = this.authService.isLoggedIn();
  }
}
