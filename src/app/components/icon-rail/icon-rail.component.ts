import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-icon-rail',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './icon-rail.component.html',
  styleUrl: './icon-rail.component.css'
})
export class IconRailComponent {
  onHelp(): void {
    // TODO: open help/about dialog
    console.log('Help clicked');
  }

  onLanguage(): void {
    // TODO: open language selector
    console.log('Language clicked');
  }

  onNotifications(): void {
    // TODO: open notifications panel
    console.log('Notifications clicked');
  }

  onProfile(): void {
    // TODO: open profile panel
    console.log('Profile clicked');
  }
}

