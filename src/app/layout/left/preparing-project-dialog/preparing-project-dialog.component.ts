import { Component, OnInit, OnDestroy, Inject, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SharedModule } from '../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../../../services/websocket.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TranslateModule } from '@ngx-translate/core';

interface AchievementCard {
  icon: string;
  title: string;
  text: string;
}

export interface PreparingProjectDialogData {
  sessionId?: string;
}

@Component({
  selector: 'app-preparing-project-dialog',
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    MatCardModule,
    MatProgressBarModule,
    TranslateModule,
  ],
  templateUrl: './preparing-project-dialog.component.html',
  styleUrl: './preparing-project-dialog.component.css'
})
export class PreparingProjectDialogComponent implements OnInit, OnDestroy {
  currentCardIndex = 0;
  private cardInterval?: any;
  private wsSubscription?: Subscription;
  private websocketService = inject(WebsocketService);

  progress = 0;
  statusMessage = '';
  showProgress = false;

  achievementCards: AchievementCard[] = [
    { 
      icon: '✨', 
      title: 'PREPARING_PROJECT.ACHIEVEMENTS.ONE_TIME_TITLE',
      text: 'PREPARING_PROJECT.ACHIEVEMENTS.ONE_TIME_TEXT'
    },
    { 
      icon: '🔧', 
      title: 'PREPARING_PROJECT.ACHIEVEMENTS.FILTER_TITLE',
      text: 'PREPARING_PROJECT.ACHIEVEMENTS.FILTER_TEXT'
    },
    { 
      icon: '🌟', 
      title: 'PREPARING_PROJECT.ACHIEVEMENTS.UNIQUE_TITLE',
      text: 'PREPARING_PROJECT.ACHIEVEMENTS.UNIQUE_TEXT'
    },
    { 
      icon: '📊', 
      title: 'PREPARING_PROJECT.ACHIEVEMENTS.STATS_TITLE',
      text: 'PREPARING_PROJECT.ACHIEVEMENTS.STATS_TEXT'
    },
  ];

  constructor(
    public dialogRef: MatDialogRef<PreparingProjectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PreparingProjectDialogData
  ) {}

  ngOnInit(): void {
    // Auto-rotate achievement cards every 5 seconds
    this.cardInterval = setInterval(() => {
      this.nextCard();
    }, 5000);

    // Connect to websocket if sessionId is provided
    if (this.data?.sessionId) {
      this.connectWebsocket(this.data.sessionId);
    }
  }

  nextCard(): void {
    if (this.currentCardIndex < this.achievementCards.length - 1) {
      this.currentCardIndex++;
    } else {
      this.currentCardIndex = 0;
    }
  }

  previousCard(): void {
    if (this.currentCardIndex > 0) {
      this.currentCardIndex--;
    } else {
      this.currentCardIndex = this.achievementCards.length - 1;
    }
  }

  goToCard(index: number): void {
    this.currentCardIndex = index;
  }

  private connectWebsocket(sessionId: string): void {
    const wsUrl = `${environment.wsURL}/preload/?session=${sessionId}`;
    const wsSubject = this.websocketService.connect<any>(wsUrl);

    this.wsSubscription = wsSubject.subscribe({
      next: (message: any) => {
        console.log('Preload websocket message:', message);
        
        // Extract progress information
        if (message.progress !== undefined) {
          this.progress = Math.min(100, Math.max(0, message.progress));
          this.showProgress = true;
        } else if (message.percentage !== undefined) {
          this.progress = Math.min(100, Math.max(0, message.percentage));
          this.showProgress = true;
        }

        // Extract status message - prioritize message field from websocket
        // The message field will contain translation keys for multilingual support
        // Skip displaying connection_ready messages visually
        if (message.type !== 'connection_ready') {
          if (message.message && typeof message.message === 'string') {
            this.statusMessage = message.message;
          } else {
            // Fall back to status-based messages if message field is not present
            const status = message.status || message.type || '';
            if (status && typeof status === 'string') {
              // Map common status strings to translation keys
              const statusLower = status.toLowerCase();
              if (statusLower.includes('start') || statusLower === 'starting') {
                this.statusMessage = 'PREPARING_PROJECT.STATUS.STARTING';
              } else if (statusLower.includes('calculat') || statusLower === 'calculating') {
                this.statusMessage = 'PREPARING_PROJECT.STATUS.CALCULATING';
              } else if (statusLower.includes('process') || statusLower === 'processing') {
                this.statusMessage = 'PREPARING_PROJECT.STATUS.PROCESSING';
              } else {
                // Use the status as-is if it doesn't match known patterns
                this.statusMessage = status;
              }
            }
          }
        }

        // Check for completion
        const status = message.status || message.type || '';
        const isCompleted = 
          status === 'completed' || 
          status === 'complete' || 
          message.completed === true ||
          message.finished === true ||
          message.done === true;
        
        if (isCompleted) {
          this.progress = 100;
          // Only override message if not already set from websocket
          if (!message.message) {
            this.statusMessage = 'PREPARING_PROJECT.STATUS.COMPLETED';
          }
        }
      },
      error: (error) => {
        console.error('Preload websocket error:', error);
        this.statusMessage = 'PREPARING_PROJECT.STATUS.ERROR';
      },
      complete: () => {
        console.log('Preload websocket connection closed');
      }
    });
  }

  ngOnDestroy(): void {
    if (this.cardInterval) {
      clearInterval(this.cardInterval);
    }
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }
}