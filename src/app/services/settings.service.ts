import { Injectable } from '@angular/core';

export interface UserSettings {
  expanded: boolean;
  verkehrsmittel: number[];
  bewertung: string | null;
  statsLevel?: 'municipality' | 'county' | 'state';
  adminLevel?: 'state' | 'county' | 'municipality' | 'hexagon' | null;
  legendBrackets?: {
    quality: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>;
    time: Array<'0-7' | '8-15' | '16-23' | '24-30' | '31-45' | '45+'>;
  };
  filters: {
    activities: number[];
    personas: number | number[] | null; // Support both old array format and new single value format
    regiostars: number[];
    states: number[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly SETTINGS_KEY = 'user_settings';

  /**
   * Load user settings from localStorage
   */
  loadSettings(): UserSettings | null {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error);
    }
    return null;
  }

  /**
   * Save user settings to localStorage
   */
  saveSettings(settings: Partial<UserSettings>): void {
    try {
      const current = this.loadSettings() || this.getDefaultSettings();
      const merged = { ...current, ...settings };
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(merged));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }

  /**
   * Get default settings
   */
  getDefaultSettings(): UserSettings {
    return {
      expanded: false,
      verkehrsmittel: [],
      bewertung: 'qualitaet',
      statsLevel: 'county',
      legendBrackets: {
        quality: ['A', 'B', 'C', 'D', 'E', 'F'],
        time: ['0-7', '8-15', '16-23', '24-30', '31-45', '45+']
      },
      filters: {
        activities: [],
        personas: null,
        regiostars: [],
        states: []
      }
    };
  }

  /**
   * Clear all settings
   */
  clearSettings(): void {
    localStorage.removeItem(this.SETTINGS_KEY);
  }
}
