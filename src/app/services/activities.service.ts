import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Activity, GroupedActivities } from './interfaces/activity.interface';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Injectable({
  providedIn: 'root'
})
export class ActivitiesService {
  private apiUrl = environment.apiUrl;
  private allActivities: Activity[] = [];

  constructor(private http: HttpClient) { }

  getActivities(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Activity>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Activity>>(`${this.apiUrl}/categories/`, { params });
  }

  getOSMActivities(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Activity>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Activity>>(`${this.apiUrl}/activities/`, { params });
  }

  getGroupedActivities(showMid: boolean = false): Observable<GroupedActivities[]> {
    // Wenn wir noch keine Aktivitäten haben, laden wir sie
    if (this.allActivities.length === 0) {
      return this.getActivities().pipe(
        map(response => {
          this.allActivities = response.results;
          return this.groupAndFilterActivities(showMid);
        })
      );
    }

    // Wenn wir bereits Aktivitäten haben, verwenden wir diese
    return new Observable(observer => {
      observer.next(this.groupAndFilterActivities(showMid));
      observer.complete();
    });
  }

  private groupAndFilterActivities(showMid: boolean): GroupedActivities[] {
    const grouped = this.allActivities
      .filter(activity => activity.mid === showMid)
      .reduce((groups: { [key: string]: Activity[] }, activity) => {
        const wegezweckId = activity.wegezweck || 'undefined';
        if (!groups[wegezweckId]) {
          groups[wegezweckId] = [];
        }
        groups[wegezweckId].push(activity);
        return groups;
      }, {});

    return Object.entries(grouped)
      .map(([_, activities]) => ({
        tripPurpose: activities[0].wegezweck!,
        activities: activities.sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.tripPurpose.localeCompare(b.tripPurpose));
  }
} 