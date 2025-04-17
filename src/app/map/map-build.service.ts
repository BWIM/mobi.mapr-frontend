import { Injectable } from "@angular/core";
import { BehaviorSubject } from 'rxjs';
import { Extent } from 'ol/extent';
import { intersects } from 'ol/extent';
import GeoJSON from 'ol/format/GeoJSON';
import { MapService, OpacityThresholds } from './map.service';
// import * as pako from 'pako';

@Injectable({
    providedIn: 'root'
})
export class MapBuildService {
    private municipalitiesLoaded = new BehaviorSubject<boolean>(false);
    municipalitiesLoaded$ = this.municipalitiesLoaded.asObservable();
    private geoJSONFormat = new GeoJSON();
    private populationArea: 'pop' | 'area' = 'pop';
    private averageType: 'mean' | 'median' = 'mean';
    private opacityThresholds: OpacityThresholds = {
        state: 500,
        county: 500,
        municipality: 500,
        hexagon: 1000
    };

    private cache: {
        states: { [key: string]: any },
        counties: { [key: string]: any },
        municipalities: { [key: string]: { [key: string]: any } },
        hexagons: { [key: string]: { [key: string]: any } }
    } = {
        states: {},
        counties: {},
        municipalities: {},
        hexagons: {}
    };

    // Add loading promise caches to prevent duplicate API calls
    private loadingPromises: {
        states: { [key: string]: Promise<void> },
        counties: { [key: string]: Promise<void> },
        municipalities: { [key: string]: Promise<void> },
        hexagons: { [key: string]: Promise<void> }
    } = {
        states: {},
        counties: {},
        municipalities: {},
        hexagons: {}
    };

    constructor(private mapService: MapService) {
        this.mapService.visualizationSettings$.subscribe(settings => {
            const populationAreaChanged = this.populationArea !== settings.populationArea;
            const averageTypeChanged = this.averageType !== settings.averageType;
            this.populationArea = settings.populationArea;
            this.averageType = settings.averageType;
            this.opacityThresholds = settings.opacityThresholds;
            
            if (populationAreaChanged || averageTypeChanged) {
                this.resetCache(false);
            } else if (settings.updatedLevel) {
                this.refreshFeatureColors(settings.updatedLevel);
            } else {
                this.refreshFeatureColors();
            }
        });
    }

    async buildMap(landkreise: { [key: string]: any }, level: 'county' | 'municipality' | 'hexagon' | 'state' = 'county', extent?: Extent) {
        await this.ensureDataLoaded(landkreise);
        
        let features;
        if (level === 'state') {
            features = Object.values(this.cache.states);
        } else if (level === 'county') {
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

        // Update opacity for all features before returning
        features.forEach(feature => {
            const featureLevel = feature.properties.level;
            const populationDensity = featureLevel === 'hexagon' ? 
                feature.properties.populationDensity : 
                feature.properties.population_density || 0;
            
            const opacity = this.calculateOpacity(populationDensity, featureLevel);
            const currentColor = feature.properties.rgbColor;
            feature.properties.rgbColor = [...currentColor.slice(0, 3), opacity];
        });

        return {
            type: "FeatureCollection",
            features
        };
    }

    resetCache(data: boolean= true) {
        this.cache = {
            states: {},
            counties: {},
            municipalities: {},
            hexagons: {}
        };
        if (data) {
            this.loadingPromises = {
                states: {},
                counties: {},
                municipalities: {},
                hexagons: {}
            };
        }
        this.municipalitiesLoaded.next(false);
    }

    private async ensureDataLoaded(landkreise: { [key: string]: any }): Promise<void> {
        // Load states first
        await this.loadStates(landkreise);
        
        // Load counties
        await this.loadCounties(landkreise);
        
        // Load municipalities and hexagons and wait for them to complete
        if (!this.municipalitiesLoaded.value) {
            await Promise.all([
                this.loadMunicipalities(landkreise),
                this.loadHexagons(landkreise)
            ]);
            this.municipalitiesLoaded.next(true);
        }
    }


    private async loadStates(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
        // Group counties by state (first 2 digits of the landkreis ID)
        const stateIds = [...new Set(Object.keys(landkreise).map(id => id.substring(0, 2) + '0000000000'))];
        const unloadedStates = stateIds.filter(id => !this.cache.states[id]);

        await Promise.all(unloadedStates.map(async stateId => {
            // Return existing promise if already loading
            if (stateId in this.loadingPromises.states) {
                return this.loadingPromises.states[stateId];
            }

            // Create new loading promise
            this.loadingPromises.states[stateId] = (async () => {
                try {
                    const response = await fetch(`assets/boundaries/${stateId}/boundary.geojson.gz`);
                    const stateGeoJson = await response.json();

                    // Calculate state-level statistics from all hexagons in all counties in the state
                    let totalScore = 0;
                    let totalPopulation = 0;
                    let totalHexagons = 0;

                    // Find all counties that belong to this state
                    const stateCounties = Object.entries(landkreise)
                        .filter(([countyId]) => countyId.startsWith(stateId.substring(0, 2)));

                    stateCounties.forEach(([_, countyData]) => {
                        Object.values(countyData).forEach(municipalityData => {
                            Object.values(municipalityData).forEach(([score, population]) => {
                                if (this.populationArea === 'pop') {
                                    totalScore += score * population;
                                    totalPopulation += population;
                                } else {
                                    totalScore += score;
                                    totalHexagons++;
                                }
                            });
                        });
                    });

                    const averageScore = this.populationArea === 'pop'
                        ? (totalPopulation > 0 ? totalScore / totalPopulation : 0)
                        : (totalHexagons > 0 ? totalScore / totalHexagons : 0);

                    stateGeoJson.properties = {
                        ...stateGeoJson.properties,
                        level: 'state',
                        minZoom: 6,
                        maxZoom: 8,
                        score: averageScore,
                        population: totalPopulation,
                        rgbColor: this.getColorForScore(averageScore, stateGeoJson.properties.population_density || 0, 'county')
                    };

                    this.cache.states[stateId] = stateGeoJson;
                } catch (error) {
                    console.warn(`Could not load state data for ${stateId}`, error);
                } finally {
                    // Clean up the loading promise
                    delete this.loadingPromises.states[stateId];
                }
            })();

            return this.loadingPromises.states[stateId];
        }));
    }

    private async loadCounties(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.counties[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            // Return existing promise if already loading
            if (landkreis in this.loadingPromises.counties) {
                return this.loadingPromises.counties[landkreis];
            }

            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            // Create new loading promise
            this.loadingPromises.counties[landkreis] = (async () => {
                try {
                    const response = await fetch(`assets/boundaries/${land}/${kreis}/boundary.geojson.gz`);
                    const countyGeoJson = await response.json();

                    const hexagonData = Object.values(landkreise[landkreis])
                        .flatMap(municipality => Object.values(municipality));
                    
                    let totalScore = 0;
                    let totalPopulation = 0;
                    let totalHexagons = 0;

                    hexagonData.forEach(([score, population]) => {
                        if (this.populationArea === 'pop') {
                            totalScore += score * population;
                            totalPopulation += population;
                        } else {
                            totalScore += score;
                            totalHexagons++;
                        }
                    });
                    
                    const averageScore = this.populationArea === 'pop' 
                        ? (totalPopulation > 0 ? totalScore / totalPopulation : 0)
                        : (totalHexagons > 0 ? totalScore / totalHexagons : 0);

                    countyGeoJson.properties = { 
                        ...countyGeoJson.properties, 
                        level: 'county',
                        minZoom: 8,
                        maxZoom: 10,
                        score: averageScore,
                        population: totalPopulation,
                        rgbColor: this.getColorForScore(averageScore, countyGeoJson.properties.population_density || 0, 'county')
                    };
                    this.cache.counties[landkreis] = countyGeoJson;
                } catch (error) {
                    console.warn(`Could not load county data for ${landkreis}`, error);
                } finally {
                    // Clean up the loading promise
                    delete this.loadingPromises.counties[landkreis];
                }
            })();

            return this.loadingPromises.counties[landkreis];
        }));
    }

    private async loadMunicipalities(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.municipalities[id]);
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            // Return existing promise if already loading
            if (landkreis in this.loadingPromises.municipalities) {
                return this.loadingPromises.municipalities[landkreis];
            }

            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            // Create new loading promise
            this.loadingPromises.municipalities[landkreis] = (async () => {
                try {
                    const response = await fetch(`assets/boundaries/${land}/${kreis}/gemeinden_shapes.geojson.gz`);
                    const municipalityGeoJson = await response.json();
                    
                    if (Array.isArray(municipalityGeoJson.features)) {
                        this.cache.municipalities[landkreis] = {};
                        municipalityGeoJson.features.forEach((feature: any) => {
                            const municipalityId = feature.properties.ars;
                            const municipalityData = landkreise[landkreis]?.[municipalityId] || {};
                            
                            const hexagonData = Object.values(municipalityData);
                            let totalScore = 0;
                            let totalPopulation = 0;
                            let totalHexagons = 0;
                            
                            hexagonData.forEach(([score, population]) => {
                                if (this.populationArea === 'pop') {
                                    totalScore += score * population;
                                    totalPopulation += population;
                                } else {
                                    totalScore += score;
                                    totalHexagons++;
                                }
                            });
                            
                            const averageScore = this.populationArea === 'pop'
                                ? (totalPopulation > 0 ? totalScore / totalPopulation : 0)
                                : (totalHexagons > 0 ? totalScore / totalHexagons : 0);

                            feature.properties = {
                                ...feature.properties,
                                level: 'municipality',
                                minZoom: 10,
                                maxZoom: 12,
                                score: averageScore,
                                population: totalPopulation,
                                populationDensity: landkreise[landkreis]?.[municipalityId]?.['population_density'] || 0,
                                rgbColor: this.getColorForScore(averageScore, feature.properties.population_density || 0, 'municipality')
                            };
                            
                            this.cache.municipalities[landkreis][municipalityId] = feature;
                        });
                    }
                } catch (error) {
                    console.warn(`Could not load municipality data for ${landkreis}`, error);
                } finally {
                    // Clean up the loading promise
                    delete this.loadingPromises.municipalities[landkreis];
                }
            })();

            return this.loadingPromises.municipalities[landkreis];
        }));
    }

    private async loadHexagons(landkreise: { [key: string]: { [key: string]: { [key: string]: [number, number] } } }): Promise<void> {
        const unloadedCounties = Object.keys(landkreise).filter(id => !this.cache.hexagons[id]);
        
        // Hexagon area in km² (assuming all hexagons have the same size)
        const HEXAGON_AREA = 1; // 1 km² per hexagon
        
        await Promise.all(unloadedCounties.map(async landkreis => {
            // Return existing promise if already loading
            if (landkreis in this.loadingPromises.hexagons) {
                return this.loadingPromises.hexagons[landkreis];
            }

            const land = landkreis.substring(0, 2) + '0000000000';
            const kreis = landkreis.substring(0, 5) + '0000000';
            
            // Create new loading promise
            this.loadingPromises.hexagons[landkreis] = (async () => {
                try {
                    const response = await fetch(`assets/boundaries/${land}/${kreis}/hexagons.geojson.gz`);
                    const hexagonGeoJson = await response.json();
                    
                    if (Array.isArray(hexagonGeoJson.features)) {
                        this.cache.hexagons[landkreis] = {};
                        hexagonGeoJson.features.forEach((feature: any) => {
                            const hexagonId = feature.properties.id;
                            
                            let score = 0;
                            let population = 0;
                            const municipalities = landkreise[landkreis] || {};
                            for (const municipalityData of Object.values(municipalities)) {
                                if (hexagonId in municipalityData) {
                                    [score, population] = municipalityData[hexagonId];
                                    break;
                                }
                            }
                            
                            const populationDensity = population / HEXAGON_AREA;
                            
                            feature.properties = {
                                ...feature.properties,
                                level: 'hexagon',
                                minZoom: 12,
                                maxZoom: 15,
                                score: score,
                                population: population,
                                area: HEXAGON_AREA,
                                populationDensity: populationDensity,
                                rgbColor: this.getColorForScore(score, populationDensity, 'hexagon')
                            };
                            
                            this.cache.hexagons[landkreis][hexagonId] = feature;
                        });
                    }
                } catch (error) {
                    console.warn(`Could not load hexagon data for ${landkreis}`, error);
                } finally {
                    // Clean up the loading promise
                    delete this.loadingPromises.hexagons[landkreis];
                }
            })();

            return this.loadingPromises.hexagons[landkreis];
        }));
    }

    private calculateOpacity(populationDensity: number, level: 'state' | 'county' | 'municipality' | 'hexagon'): number {
        // Constants for density scaling
        const MIN_DENSITY = 1;  // Minimum density to avoid log(0)
        let MAX_DENSITY = 1000000;
        if (level === 'state') {
            MAX_DENSITY = 1782202;  // Maximum expected density for states
        } else if (level === 'county') {
            MAX_DENSITY = 1782202;  // Maximum expected density
        } else if (level === 'municipality') {
            MAX_DENSITY = 3062;  // Maximum expected density
        } else {
            MAX_DENSITY = 18338;  // Maximum expected density
        }
        const MIN_OPACITY = 0.3;
        const MAX_OPACITY = 0.9;
        const OPACITY_RANGE = MAX_OPACITY - MIN_OPACITY;

        // Handle invalid or zero density
        if (!populationDensity || populationDensity <= 0) {
            return MIN_OPACITY;
        }

        try {
            // Apply logarithmic scaling
            const logMinDensity = Math.log(MIN_DENSITY);
            const logMaxDensity = Math.log(MAX_DENSITY);
            const logDensity = Math.log(Math.max(MIN_DENSITY, populationDensity));

            // Normalize to [0,1]
            const normalizedDensity = (logDensity - logMinDensity) / (logMaxDensity - logMinDensity);
            const clampedDensity = Math.max(0, Math.min(1, normalizedDensity));

            // Map to opacity range
            return MIN_OPACITY + (OPACITY_RANGE * clampedDensity);
        } catch (error) {
            console.error('Error calculating opacity:', error);
            return MIN_OPACITY;
        }
    }

    private getColorForScore(score: number, populationDensity: number = 0, level: 'state' | 'county' | 'municipality' | 'hexagon' = 'county'): number[] {
        const colorSteps = [
            [50,97,45],    // Pure green (score <= 0.33)
            [60,176,67],   // Light green (score <= 0.66)
            [238,210,2],   // Yellow-green (score <= 1.0)
            [237,112,20],  // Yellow-orange (score <= 1.33)
            [194,24,7],    // Orange (score <= 1.66)
            [150,86,162]   // Pure red (score <= 2.0)
        ];

        const opacity = this.calculateOpacity(populationDensity, level);

        if (score <= 0) return [128,128,128,0];
        if (score <= 0.35) return [...colorSteps[0], opacity];
        if (score <= 0.5) return [...colorSteps[1], opacity];
        if (score <= 0.71) return [...colorSteps[2], opacity];
        if (score <= 1) return [...colorSteps[3], opacity];
        if (score <= 1.41) return [...colorSteps[4], opacity];
        return [...colorSteps[5], opacity];
    }

    private refreshFeatureColors(level?: 'state' | 'county' | 'municipality' | 'hexagon'): void {
        const vectorLayer = this.mapService.getMainLayer();
        if (!vectorLayer || !vectorLayer.getSource()) return;

        const source = vectorLayer.getSource();
        if (!source) return;
        const features = source.getFeatures();

        // If level is specified, only update features of that level
        features.forEach(feature => {
            const properties = feature.getProperties();
            const featureLevel = properties['level'] as 'state' | 'county' | 'municipality' | 'hexagon';
            
            // Skip if level is specified and doesn't match
            if (level && featureLevel !== level) return;

            const populationDensity = featureLevel === 'hexagon' ? 
                properties['populationDensity'] : 
                properties['population_density'] || 0;
            
            const opacity = this.calculateOpacity(populationDensity, featureLevel);
            const currentColor = properties['rgbColor'];
            
            // Update both the cache and the feature in one go
            const newColor = [...currentColor.slice(0, 3), opacity];
            feature.set('rgbColor', newColor);

            // Update the cache
            const featureId = properties['id'] || properties['ars'];
            if (featureId) {
                switch (featureLevel) {
                    case 'state':
                        if (this.cache.states[featureId]) {
                            this.cache.states[featureId].properties.rgbColor = newColor;
                        }
                        break;
                    case 'county':
                        if (this.cache.counties[featureId]) {
                            this.cache.counties[featureId].properties.rgbColor = newColor;
                        }
                        break;
                    case 'municipality':
                        // Find and update in municipality cache
                        Object.values(this.cache.municipalities).forEach(municipalityGroup => {
                            if (municipalityGroup[featureId]) {
                                municipalityGroup[featureId].properties.rgbColor = newColor;
                            }
                        });
                        break;
                    case 'hexagon':
                        // Find and update in hexagon cache
                        Object.values(this.cache.hexagons).forEach(hexagonGroup => {
                            if (hexagonGroup[featureId]) {
                                hexagonGroup[featureId].properties.rgbColor = newColor;
                            }
                        });
                        break;
                }
            }
        });

        // Force a single redraw after all updates
        source?.changed();
    }
}
