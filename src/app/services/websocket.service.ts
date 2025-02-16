import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  constructor(private sessionService: SessionService) {}

  connect<T>(baseUrl: string): WebSocketSubject<T> {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}${this.sessionService.getRequestParameters()}`;

    return webSocket<T>({
      url,
      deserializer: msg => JSON.parse(msg.data)
    });
  }
} 