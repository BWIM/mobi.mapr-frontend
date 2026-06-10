declare module '@maplibre/maplibre-gl-compare' {
  import { Map } from 'maplibre-gl';

  export default class Compare {
    constructor(
      before: Map,
      after: Map,
      container: string | HTMLElement,
      options?: { mousemove?: boolean }
    );
    setSlider(x: number): void;
    remove(): void;
  }
}
