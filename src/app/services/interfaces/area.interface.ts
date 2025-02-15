interface Geometry {
    type: "MultiPolygon";
    coordinates: number[][][][];
}

interface Feature {
    id: number;
    type: "Feature";
    geometry: Geometry;
    properties: {
        name: string;
        land?: number;
        ags?: string;
    };
}

export interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
}

export interface Area {
    id: number;
    name: string;
    land?: number;
    ags?: string;
    geom: Feature;
}

export interface PaginatedAreasResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Area[];
} 