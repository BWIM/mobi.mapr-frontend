declare module '@camptocamp/inkmap' {
  export interface MapSpec {
    center?: [number, number];
    zoom?: number;
    bounds?: [[number, number], [number, number]];
    size?: [number, number, string];
    layers?: any[];
    attributions?: any;
    northArrow?: boolean;
    scaleBar?: boolean;
    projection?: string;
    dpi?: number;
    [key: string]: any;
  }

  export interface NorthArrow {
    getImage(): HTMLCanvasElement;
    getRealWorldDimensions(unit: string): [number, number];
  }

  export function print(spec: any): Promise<Blob>;
  export function getAttributionsText(spec: MapSpec): string;
  export function getNorthArrow(spec: MapSpec, size: [number, string]): NorthArrow;
  export function downloadBlob(blob: Blob): void;
}
