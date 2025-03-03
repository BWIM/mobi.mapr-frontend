import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({
    providedIn: 'root'
  })
  export class AnalyzeService {
    private visibleSubject = new BehaviorSubject<boolean>(false);
    visible$ = this.visibleSubject.asObservable();
  
    private currentProjectId: string | null = null;
    private currentMapType: string | null = null;
    private selectedFeatureId: string | null = null;
  
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
  
    setSelectedFeature(featureId: string) {
      this.selectedFeatureId = featureId;
      this.show(); // Automatisch das Analyse-Panel öffnen, wenn ein Feature ausgewählt wurde
    }
  
    getCurrentState() {
      return {
        projectId: this.currentProjectId,
        mapType: this.currentMapType,
        featureId: this.selectedFeatureId
      };
    }
  }