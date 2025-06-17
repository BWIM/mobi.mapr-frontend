import { Component, Output, EventEmitter, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GeocodingService, GeocodingResult } from '../../services/geocoding.service';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { SharedModule } from '../../shared/shared.module';
import { OverlayPanel } from 'primeng/overlaypanel';

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [FormsModule, CommonModule, SharedModule],
  template: `
    <div class="search-overlay">
      <p-button 
        icon="pi pi-search" 
        (click)="toggleSearch($event)"
        class="p-button-rounded p-button-text"
        [style]="{'width': '40px', 'height': '40px'}"
      ></p-button>
      
      <p-overlayPanel #op [showCloseIcon]="false" [dismissable]="true" (onHide)="onOverlayHide()">
        <div class="search-container">
          <div class="search-input-wrapper">
            <span class="p-input-icon-right w-full">
              <i class="pi pi-search"></i>
              <input 
                type="text" 
                pInputText
                [(ngModel)]="searchQuery" 
                (input)="onSearchInput()"
                placeholder="{{ 'SEARCH_OVERLAY.SEARCH_PLACEHOLDER' | translate }}"
                class="w-full"
              />
            </span>
            <div class="loading-spinner" *ngIf="isLoading"></div>
          </div>
          <div class="search-results" *ngIf="showResults">
            <div 
              *ngFor="let result of searchResults" 
              class="search-result-item"
              (click)="selectLocation(result)"
            >
              {{ result.display_name }}
            </div>
            <div class="no-results" *ngIf="searchResults.length === 0 && !isLoading">
              No results found
            </div>
          </div>
        </div>
      </p-overlayPanel>
    </div>
  `,
  styles: [`
    .search-overlay {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 100;
    }
    .search-container {
      background: white;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      width: 300px;
    }
    .search-input-wrapper {
      position: relative;
      padding: 10px;
    }
    .loading-spinner {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      border: 2px solid #f3f3f3;
      border-top: 2px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: translateY(-50%) rotate(0deg); }
      100% { transform: translateY(-50%) rotate(360deg); }
    }
    .search-results {
      max-height: 300px;
      overflow-y: auto;
    }
    .search-result-item {
      padding: 10px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
      font-size: 13px;
      line-height: 1.4;
    }
    .search-result-item:hover {
      background-color: #f5f5f5;
    }
    .no-results {
      padding: 10px;
      color: #666;
      text-align: center;
      font-style: italic;
    }
  `]
})
export class SearchOverlayComponent {
  @ViewChild('op') overlayPanel!: OverlayPanel;
  @Output() locationSelected = new EventEmitter<{lng: number, lat: number}>();
  
  searchQuery: string = '';
  searchResults: GeocodingResult[] = [];
  showResults: boolean = false;
  isLoading: boolean = false;
  private searchSubject = new Subject<string>();

  constructor(private geocodingService: GeocodingService) {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  toggleSearch(event: Event) {
    this.overlayPanel.toggle(event);
  }

  onOverlayHide() {
    this.showResults = false;
    this.searchQuery = '';
  }

  onSearchInput() {
    if (this.searchQuery.length < 2) {
      this.showResults = false;
      return;
    }
    this.searchSubject.next(this.searchQuery);
  }

  private performSearch(query: string) {
    this.isLoading = true;
    this.showResults = true;

    this.geocodingService.search(query).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Geocoding error:', error);
        this.searchResults = [];
        this.isLoading = false;
      }
    });
  }

  selectLocation(location: GeocodingResult) {
    this.locationSelected.emit({ lng: location.lng, lat: location.lat });
    this.showResults = false;
    this.searchQuery = '';
    this.overlayPanel.hide();
  }
} 