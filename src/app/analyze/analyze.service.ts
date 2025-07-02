import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { MapGeoJSONFeature } from "maplibre-gl";

@Injectable({
    providedIn: 'root'
  })
  export class AnalyzeService {
    private visibleSubject = new BehaviorSubject<boolean>(false);
    visible$ = this.visibleSubject.asObservable();
  
    private currentProjectId: string | null = null;
    private currentMapType: string | null = null;
    private selectedFeature: MapGeoJSONFeature | null = null;
  
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
  
    setSelectedFeature(feature: MapGeoJSONFeature) {
      console.log(feature);
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