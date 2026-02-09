import { MultiPolygon } from "ol/geom";

export interface Properties {
    mobiscore: number;
    population: number;
    geometry: MultiPolygon;
    name: string;
    color: string;
    rgbColor: number[];
    [key: string]: number | string | MultiPolygon | number[];
}

export interface Place {
    id: number;
    name: string;
    uri: string;
    lat: number;
    lon: number;
    rating: number;
    activity: number;
}

export interface Profile {
    id: number;
    index: number;
    score?: number;
}

export interface Persona {
    id: number;
    index: number;
    score?: number;
}

export interface Category {
    id: number;
    weight: number;
    index: number;
    score?: number;
}

export interface Activity {
    id: number;
    index: number;
    score?: number;
    weight: number;
}

export interface DisplayNameItem {
    id: number;
    display_name: string;
}

export interface CategoryWithDisplayName extends Category {
    display_name: string;
}

export interface ActivityWithDisplayName extends Activity {
    display_name: string;
}

export interface PersonaWithDisplayName extends Persona {
    display_name: string;
}

export interface ProfileWithDisplayName extends Profile {
    display_name: string;
}