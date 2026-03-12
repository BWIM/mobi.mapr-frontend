import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FeedbackPayload {
  problem: string;
  email?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  submitFeedback(feedback: FeedbackPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/feedback/`, feedback);
  }
}
