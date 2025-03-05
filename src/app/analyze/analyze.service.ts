import { Injectable } from "@angular/core";
import Feature from "ol/Feature";
import { BehaviorSubject } from "rxjs";

@Injectable({
    providedIn: 'root'
  })
  export class AnalyzeService {
    private visibleSubject = new BehaviorSubject<boolean>(false);
    visible$ = this.visibleSubject.asObservable();
  
    private currentProjectId: string | null = null;
    private currentMapType: string | null = null;
    private selectedFeature: Feature | null = null;
  
    show() {
      this.visibleSubject.next(true);
    }
  
    hide() {
      this.visibleSubject.next(false);
    }
  
    setCurrentProject(projectId: string) {
      this.currentProjectId = projectId;
    }

  
    setMapType(mapType: string) {
      this.currentMapType = mapType;
    }
  
    setSelectedFeature(feature: Feature) {
      this.selectedFeature = feature;
      this.show(); // Automatisch das Analyse-Panel öffnen, wenn ein Feature ausgewählt wurde
    }
  
    getCurrentState() {
      return {
        projectId: this.currentProjectId,
        mapType: this.currentMapType,
        feature: this.selectedFeature
      };
    }
  }