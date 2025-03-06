import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly SESSION_ID_KEY = 'session_id';
  private readonly LANGUAGE_KEY = 'language';
  private sessionId: string;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem(this.SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = uuidv4();
      localStorage.setItem(this.SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getCurrentLanguage(): string {
    return localStorage.getItem(this.LANGUAGE_KEY) || 'de';
  }

  setCurrentLanguage(lang: string): void {
    localStorage.setItem(this.LANGUAGE_KEY, lang);
  }

  getRequestParameters(): string {
    return `sessionID=${this.getSessionId()}&lang=${this.getCurrentLanguage()}`;
  }
} 