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