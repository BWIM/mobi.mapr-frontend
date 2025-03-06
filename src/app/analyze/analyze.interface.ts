import { MultiPolygon } from "ol/geom";

export interface Properties {
    mobiscore: number;
    population: number;
    geometry: MultiPolygon;
    name: string;
    color: string;
    rgbColor: number[];
}