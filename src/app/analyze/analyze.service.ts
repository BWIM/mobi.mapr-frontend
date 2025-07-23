import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { MapGeoJSONFeature } from "maplibre-gl";
import { environment } from "../../environments/environment";
import { HttpClient } from "@angular/common/http";
import { Place } from "./analyze.interface";
import { ShareService } from "../share/share.service";

@Injectable({
    providedIn: 'root'
  })
  export class AnalyzeService {
    private visibleSubject = new BehaviorSubject<boolean>(false);
    visible$ = this.visibleSubject.asObservable();

    constructor(private http: HttpClient, private shareService: ShareService) {}
  
    private currentProjectId: string | null = null;
    private currentMapType: string | null = null;
    private selectedFeature: MapGeoJSONFeature | null = null;
    private featureId: string | null = null;
    private resolution: string | null = null;
    private coordinates: number[] | null = null;
    private hexagonView: boolean = false;
  
    show() {
      this.visibleSubject.next(true);
    }
  
    hide() {
      this.visibleSubject.next(false);
    }
  
    setCurrentProject(projectId: string) {
      this.currentProjectId = projectId;
    }

    getCoordinates(): number[] | null {
      return this.coordinates;
    }

  
    setMapType(mapType: string) {
      this.currentMapType = mapType;
    }

    setHexagonView(hexagonView: boolean) {
      this.hexagonView = hexagonView;
    }
  
    setSelectedFeature(feature: MapGeoJSONFeature, resolution: string, coordinates: number[]) {
      this.selectedFeature = feature;
      this.featureId = feature['properties']['id'];
      this.coordinates = coordinates;
      this.resolution = resolution;
      this.show(); // Automatisch das Analyse-Panel öffnen, wenn ein Feature ausgewählt wurde
    }
  
    getCurrentState() {
      return {
        projectId: this.currentProjectId,
        mapType: this.currentMapType,
        feature: this.selectedFeature
      };
    }

    getPlaces(activityId: number) {
      let type = this.resolution;
      const featureId = this.featureId;

      if (this.hexagonView) {
        type = "hexagon"
      }

      if (this.shareService.getIsShare()) {
        const shareKey = this.shareService.getShareKey();
        const url = `${environment.apiUrl}/share-place?activity=${activityId}&type=${type}&feature=${featureId}&project=${this.currentProjectId}&key=${shareKey}`;
        return this.http.get<Place[]>(url);
      } else {
        const url = `${environment.apiUrl}/places/details?activity=${activityId}&type=${type}&feature=${featureId}&project=${this.currentProjectId}`;
        return this.http.get<Place[]>(url);
        
      }

    }

    getShape(featureId: string, type: string) {
      const url = `${environment.apiUrl}/shapes?feature=${featureId}&type=${type}`;
      return this.http.get<any>(url);
    }
  }