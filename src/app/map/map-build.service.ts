import { Injectable } from "@angular/core";
import { Subject, BehaviorSubject } from 'rxjs';
import { Extent } from 'ol/extent';
import { intersects } from 'ol/extent';
import { Geometry } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';

@Injectable({
    providedIn: 'root'
})
export class MapBuildService {
    private municipalitiesLoaded = new BehaviorSubject<boolean>(false);
    municipalitiesLoaded$ = this.municipalitiesLoaded.asObservable();
    private geoJSONFormat = new GeoJSON();

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

    async buildMap(landkreise: { [key: string]: any }, level: 'county' | 'municipality' | 'hexagon' = 'county', extent?: Extent) {
        await this.ensureDataLoaded(landkreise);
        
        let features;
        if (level === 'county') {
            features = Object.values(this.cache.counties);
        } else if (level === 'municipality') {
            features = Object.values(this.cache.municipalities)
                .flatMap(municipalityGroup => Object.values(municipalityGroup));
        } else {
            // For hexagons, only return those in the viewport
            if (extent) {
                features = Object.values(this.cache.hexagons)
                    .flatMap(hexagonGroup => Object.values(hexagonGroup))
                    .filter(feature => {
                        const geometry = this.geoJSONFormat.readGeometry(feature.geometry, {
                            featureProjection: 'EPSG:3857'  // Web Mercator (the projection used by OpenLayers)
                        });
                        return intersects(extent, geometry.getExtent());
                    });
            } else {
                features = Object.values(this.cache.hexagons)
                    .flatMap(hexagonGroup => Object.values(hexagonGroup));
            }
        }

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

    private async loadCounties(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.counties[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            try {
                const response = await fetch(`assets/boundaries/${land}/${kreis}/boundary.geojson`);
                const countyGeoJson = await response.json();

                // Calculate average score and total population of all hexagons in this county
                const hexagonData = Object.values(landkreise[landkreis])
                    .flatMap(municipality => Object.values(municipality));
                
                let totalScore = 0;
                let totalPopulation = 0;
                hexagonData.forEach(([score, population]) => {
                    totalScore += score * population;  // Weight score by population
                    totalPopulation += population;
                });
                
                const averageScore = totalPopulation > 0
                    ? totalScore / totalPopulation
                    : 0;

                countyGeoJson.properties = { 
                    ...countyGeoJson.properties, 
                    level: 'county',
                    minZoom: 8,
                    maxZoom: 10,
                    score: averageScore,
                    population: totalPopulation,
                    rgbColor: this.getColorForScore(averageScore)
                };
                this.cache.counties[landkreis] = countyGeoJson;
            } catch (error) {
                console.warn(`Could not load county data for ${landkreis}`, error);
            }
        }));
    }

    private async loadMunicipalities(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
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
                        const municipalityId = feature.properties.ars;
                        
                        // Get the municipality data directly from the landkreise structure
                        const municipalityData = landkreise[landkreis]?.[municipalityId] || {};
                        
                        // Calculate average score from all hexagons in this municipality
                        const hexagonData = Object.values(municipalityData);
                        let totalScore = 0;
                        let totalPopulation = 0;
                        
                        hexagonData.forEach(([score, population]) => {
                            totalScore += score * population;  // Weight score by population
                            totalPopulation += population;
                        });
                        
                        const averageScore = totalPopulation > 0
                            ? totalScore / totalPopulation
                            : 0;
                        
                        feature.properties = {
                            ...feature.properties,
                            level: 'municipality',
                            minZoom: 10,
                            maxZoom: 12,
                            score: averageScore,
                            population: totalPopulation,
                            rgbColor: this.getColorForScore(averageScore)
                        };
                        
                        this.cache.municipalities[landkreis][municipalityId] = feature;
                    });
                }
            } catch (error) {
                console.warn(`Could not load municipality data for ${landkreis}`, error);
            }
        }));
    }

    private async loadHexagons(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
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
                        const hexagonId = feature.properties.id;
                        
                        // Find the hexagon data by searching through all municipalities
                        let score = 0;
                        let population = 0;
                        const municipalities = landkreise[landkreis] || {};
                        for (const municipalityData of Object.values(municipalities)) {
                            if (hexagonId in municipalityData) {
                                [score, population] = municipalityData[hexagonId];
                                break;
                            }
                        }
                        
                        feature.properties = {
                            ...feature.properties,
                            level: 'hexagon',
                            minZoom: 12,
                            maxZoom: 15,
                            score: score,
                            population: population,
                            rgbColor: this.getColorForScore(score)
                        };
                        
                        this.cache.hexagons[landkreis][hexagonId] = feature;
                    });
                }
            } catch (error) {
                console.warn(`Could not load hexagon data for ${landkreis}`, error);
            }
        }));
    }

    private getColorForScore(score: number): number[] {
        // Define 6 color steps from green to red
        const colorSteps = [
            [50,97,45,0.7],    // Pure green (score <= 0.33)
            [60,176,67,0.7],  // Light green (score <= 0.66)
            [238,210,2,0.7],  // Yellow-green (score <= 1.0)
            [237,112,20,0.7],  // Yellow-orange (score <= 1.33)
            [194,24,7,0.7],  // Orange (score <= 1.66)
            [150,86,162,0.7]     // Pure red (score <= 2.0)
        ];

        // Determine which step the score falls into
        if (score <= 0.35) return colorSteps[0];
        if (score <= 0.5) return colorSteps[1];
        if (score <= 0.71) return colorSteps[2];
        if (score <= 1) return colorSteps[3];
        if (score <= 1.41) return colorSteps[4];
        return colorSteps[5];
    }
}
