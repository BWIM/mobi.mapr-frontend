export interface PersonaActivityCategory {
  id: number;
  name: string;
  display_name: string;
}

export interface PersonaActivityWeight {
  activity_id: number;
  activity_name: string;
  activity_display_name: string;
  weight: number;
  categories: PersonaActivityCategory[];
}

export interface PersonaTemplate {
  id: number;
  name: string;
  display_name: string;
  description?: string | null;
  abbreviation?: string | null;
  can_use_car: boolean;
  weights: PersonaActivityWeight[];
}

export interface CustomPersona {
  id: number;
  name: string;
  display_name: string;
  description?: string | null;
  abbreviation?: string | null;
  can_use_car: boolean;
  based_on: number | null;
  based_on_display_name?: string | null;
  weights: PersonaActivityWeight[];
  published_project_id: number | null;
}
