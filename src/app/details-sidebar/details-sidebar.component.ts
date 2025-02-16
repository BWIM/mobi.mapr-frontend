import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-details-sidebar',
  standalone: true,
  imports: [
    SharedModule
  ],
  templateUrl: './details-sidebar.component.html',
  styleUrl: './details-sidebar.component.css'
})
export class DetailsSidebarComponent implements OnInit {
  isPinned: boolean = false;
  sidebarExpanded: boolean = false;

  constructor() {}

  ngOnInit() {}

  showSidebar() {
    this.sidebarExpanded = true;
  }

  togglePin() {
    this.isPinned = !this.isPinned;
  }

  mouseLeave() {
    if (!this.isPinned) {
      this.sidebarExpanded = false;
    }
  }

  pinSidebar() {
    this.sidebarExpanded = true;
    this.isPinned = true;
  }
} 