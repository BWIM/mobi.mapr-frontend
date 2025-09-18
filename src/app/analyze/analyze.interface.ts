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
    name_de: string;
    name_en: string;
    index: number;
}

export interface Persona {
    id: number;
    name_de: string;
    name_en: string;
    index: number;
}

export interface Category {
    id: number;
    name_de: string;
    name_en: string;
    weight: number;
    index: number;
}

export interface Activity {
    id: number;
    name_de: string;
    name_en: string;
    index: number;
    weight: number;
}