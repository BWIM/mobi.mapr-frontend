import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FeatureHelpersService {

  constructor() { }

  getColorForScore(score: number, populationDensity: number = 0, level: 'state' | 'county' | 'municipality' | 'hexagon' = 'county'): number[] {
    const colorSteps = [
      [50, 97, 45],    // Pure green (score <= 0.33)
      [60, 176, 67],   // Light green (score <= 0.66)
      [238, 210, 2],   // Yellow-green (score <= 1.0)
      [237, 112, 20],  // Yellow-orange (score <= 1.33)
      [194, 24, 7],    // Orange (score <= 1.66)
      [150, 86, 162]   // Pure red (score <= 2.0)
    ];
    score = Math.floor(score * 100) / 100;

    const opacity = this.calculateOpacity(populationDensity, level);

    if (score <= 0) return [128, 128, 128, 0];
    if (score <= 0.35) return [...colorSteps[0], opacity];
    if (score <= 0.5) return [...colorSteps[1], opacity];
    if (score <= 0.71) return [...colorSteps[2], opacity];
    if (score <= 1) return [...colorSteps[3], opacity];
    if (score <= 1.41) return [...colorSteps[4], opacity];
    return [...colorSteps[5], opacity];
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
}
