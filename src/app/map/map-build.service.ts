import { Injectable } from "@angular/core";
import { Subject, BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class MapBuildService {
    private municipalitiesLoaded = new BehaviorSubject<boolean>(false);
    municipalitiesLoaded$ = this.municipalitiesLoaded.asObservable();

    private cache: {
        counties: { [key: string]: any },
        municipalities: { [key: string]: { [key: string]: any } },
        hexagons: { [key: string]: { [key: string]: any } }
    } = {
        counties: {},
        municipalities: {},
        hexagons: {}
    };

    constructor() {}

    async buildMap(landkreise: { [key: string]: any }, level: 'county' | 'municipality' | 'hexagon' = 'county') {
        await this.ensureDataLoaded(landkreise);
        
        const features = level === 'county' 
            ? Object.values(this.cache.counties)
            : level === 'municipality'
                ? Object.values(this.cache.municipalities)
                    .flatMap(municipalityGroup => Object.values(municipalityGroup))
                : Object.values(this.cache.hexagons)
                    .flatMap(hexagonGroup => Object.values(hexagonGroup));

        return {
            type: "FeatureCollection",
            features
        };
    }

    private async ensureDataLoaded(landkreise: { [key: string]: any }): Promise<void> {
        // Load counties first
        await this.loadCounties(landkreise);
        
        // Load municipalities and hexagons in background if not already loaded
        if (!this.municipalitiesLoaded.value) {
            Promise.all([
                this.loadMunicipalities(landkreise),
                this.loadHexagons(landkreise)
            ]).then(() => {
                this.municipalitiesLoaded.next(true);
            });
        }
    }

    private async loadCounties(landkreise: { [key: string]: any }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.counties[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            try {
                const response = await fetch(`assets/boundaries/${land}/${kreis}/boundary.geojson`);
                const countyGeoJson = await response.json();
                countyGeoJson.properties = { 
                    ...countyGeoJson.properties, 
                    level: 'county',
                    minZoom: 8,
                    maxZoom: 10
                };
                this.cache.counties[landkreis] = countyGeoJson;
            } catch (error) {
                console.warn(`Could not load county data for ${landkreis}`, error);
            }
        }));
    }

    private async loadMunicipalities(landkreise: { [key: string]: any }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.municipalities[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            try {
                const response = await fetch(`assets/boundaries/${land}/${kreis}/gemeinden_shapes.geojson`);
                const municipalityGeoJson = await response.json();
                
                if (Array.isArray(municipalityGeoJson.features)) {
                    this.cache.municipalities[landkreis] = {};
                    municipalityGeoJson.features.forEach((feature: any) => {
                        feature.properties = {
                            ...feature.properties,
                            level: 'municipality',
                            minZoom: 10,
                            maxZoom: 12
                        };
                        // Store each municipality feature individually using its ID
                        const municipalityId = feature.properties.id;
                        this.cache.municipalities[landkreis][municipalityId] = feature;
                    });
                }
            } catch (error) {
                console.warn(`Could not load municipality data for ${landkreis}`, error);
            }
        }));
    }

    private async loadHexagons(landkreise: { [key: string]: any }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.hexagons[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            try {
                const response = await fetch(`assets/boundaries/${land}/${kreis}/hexagons.geojson`);
                const hexagonGeoJson = await response.json();
                
                if (Array.isArray(hexagonGeoJson.features)) {
                    this.cache.hexagons[landkreis] = {};
                    hexagonGeoJson.features.forEach((feature: any) => {
                        feature.properties = {
                            ...feature.properties,
                            level: 'hexagon',
                            minZoom: 12,
                            maxZoom: 15
                        };
                        const hexagonId = feature.properties.id;
                        this.cache.hexagons[landkreis][hexagonId] = feature;
                    });
                }
            } catch (error) {
                console.warn(`Could not load hexagon data for ${landkreis}`, error);
            }
        }));
    }
}
