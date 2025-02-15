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

  constructor(private http: HttpClient) { }

  getActivities(page: number = 1, pageSize: number = 100): Observable<PaginatedResponse<Activity>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<PaginatedResponse<Activity>>(`${this.apiUrl}/categories/`, { params });
  }

  getGroupedActivities(): Observable<GroupedActivities[]> {
    return this.getActivities().pipe(
      map(response => {
        // Filtere zunächst nach mid=true und gruppiere dann nach Wegezweck
        const grouped = response.results
          .filter(activity => activity.mid === true)
          .reduce((groups: { [key: string]: Activity[] }, activity) => {
            const wegezweckId = activity.wegezweck || 'undefined';
            if (!groups[wegezweckId]) {
              groups[wegezweckId] = [];
            }
            groups[wegezweckId].push(activity);
            return groups;
          }, {});

        // Konvertiere in das gewünschte Format und sortiere
        return Object.entries(grouped)
          .map(([_, activities]) => ({
            tripPurpose: activities[0].wegezweck!,
            activities: activities.sort((a, b) => a.name.localeCompare(b.name))
          }))
          .sort((a, b) => a.tripPurpose.localeCompare(b.tripPurpose));
      })
    );
  }
} 