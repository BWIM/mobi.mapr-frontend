import { Injectable } from '@angular/core';
import { FeatureHelpersService } from './feature-helpers.service';

interface HexagonData {
    [hexagonId: string]: [number, number]; // [score, population]
}

interface MunicipalityData {
    [municipalityId: string]: HexagonData;
}

interface CountyData {
    [countyId: string]: MunicipalityData;
}

@Injectable({
    providedIn: 'root'
})
export class FeatureBuilderService {
    geodata_pop: CountyData = {} 
    geodata_area: CountyData = {}
    accumulationType: 'pop' | 'area' = 'pop'
    constructor(private helperService: FeatureHelpersService) { }

    /**
     * Converts the raw feature data into a GeoJSON FeatureCollection
     * @param features Raw feature data organized by county and municipality
     * @returns GeoJSON FeatureCollection
     */
    async buildGeoJSON(landkreise: CountyData, level: 'county' | 'municipality' | 'hexagon' | 'state' = 'state', accumumlationType: 'pop' | 'area' = 'pop'): Promise<any> {
        this.accumulationType = accumumlationType
        const geojsonFeatures: GeoJSON.Feature[] = [];

        // Step 1: Counties
        const geodata = await this.loadData(landkreise)

        return {
            type: 'FeatureCollection',
            features: geodata
        };
    }


    private async loadData(landkreise: CountyData): Promise<any> {
        // Builds temporary dicts with all the info for the current project
        const stateIds = [...new Set(Object.keys(landkreise).map(id => id.substring(0, 2) + '0000000000'))];
        const geodata = await Promise.all(stateIds.map(async stateId => {

        // Create new loading promise
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
            let municipality_score = 0;
            let municipality_total = 0;
            Object.values(countyData).forEach(municipalityData => {
                Object.values(municipalityData).forEach(([score, population]) => {
                    if (this.accumulationType === 'pop') {
                        totalScore += score * population;
                        totalPopulation += population;
                    } else {
                        totalScore += score;
                        totalHexagons++;
                    }
                });
            });
        });

        const averageScore = this.accumulationType === 'pop'
            ? (totalPopulation > 0 ? totalScore / totalPopulation : 0)
            : (totalHexagons > 0 ? totalScore / totalHexagons : 0);


        return stateGeoJson
        }));
        return geodata
    }

}