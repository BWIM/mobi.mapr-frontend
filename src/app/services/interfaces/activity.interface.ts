export interface Activity {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  factor?: number;
  mid: boolean;
  wegezweck?: string;
  abbreviation?: string;
}

export interface GroupedActivities {
  tripPurpose: string;
  activities: Activity[];
} 