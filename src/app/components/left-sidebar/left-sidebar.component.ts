import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-left-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslateModule
  ],
  templateUrl: './left-sidebar.component.html',
  styleUrl: './left-sidebar.component.css'
})
export class LeftSidebarComponent {
  currentLanguage: string = 'de';

  switchLanguage(lang: string): void {
    this.currentLanguage = lang;
    // TODO: Implement language switching
    console.log('Switching language to:', lang);
  }

  openInfo(): void {
    // TODO: Implement info dialog
    console.log('Opening info dialog');
  }

  openLogin(): void {
    // TODO: Implement login dialog
    console.log('Opening login dialog');
  }
}
