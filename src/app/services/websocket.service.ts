import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { SessionService } from './session.service';
import * as uuid from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private sessionId: string;
  private connections: Map<string, WebSocketSubject<any>> = new Map();

  constructor(private sessionService: SessionService) {
    this.sessionId = localStorage.getItem('session_id') || uuid.v4();
  }

  connect<T>(url: string): WebSocketSubject<T> {
    const wsUrl = `${url}&session=${this.sessionId}`;
    
    if (this.connections.has(wsUrl)) {
      return this.connections.get(wsUrl) as WebSocketSubject<T>;
    }

    const wsSubject = new WebSocketSubject<T>({
      url: wsUrl,
      closeObserver: {
        next: () => {
          console.log('WebSocket Verbindung geschlossen');
          this.connections.delete(wsUrl);
        }
      }
    });

    this.connections.set(wsUrl, wsSubject);
    return wsSubject;
  }

  closeConnection(url: string): void {
    const connection = this.connections.get(url);
    if (connection) {
      connection.complete();
      this.connections.delete(url);
    }
  }

  closeAll(): void {
    this.connections.forEach(connection => connection.complete());
    this.connections.clear();
  }
} 