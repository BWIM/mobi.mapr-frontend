export interface ProjectGroup {
    id: string;
    user: string;  // User ID
    name: string;
    description?: string;
    default: boolean;
}

export interface Project {
    id: number;
    display_name?: string;
    description?: string;
    calculated: number;
    areas: number;
    
    type?: string;
    default: boolean;
    created: Date;
    
    finished: boolean;
    projectgroup?: ProjectGroup;  // ProjectGroup ID
    build_hexagons?: boolean;

    version: number;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ProjectCreateUpdate {
    display_name?: string;
    description?: string;
    type?: string;
    default?: boolean;
    projectgroup?: string;
}

export interface ProjectGroupCreateUpdate {
    name: string;
    description?: string;
    default?: boolean;
} 

export interface ProjectInfo {
    id: number;
    display_name: string;
    description: string;
    activities: string[];
    profiles: string[];
    personas: string[];
    type: string;
  }

  export interface ExportProject {
    project_name: string;
    project_description: string;
    creation_date: string;
    persona_abbreviations: string[];
    profile_modes: string[];
    activity_abbreviations: string[];
  }

export interface UnfinishedProject {
  id: number;
  display_name: string;
  progress: number;
}

export interface ProjectsFinishedStatus {
  all_finished: boolean;
  unfinished_projects: UnfinishedProject[];
}

export interface PersonaScore {
  persona: number;
  score: number;
}

export interface CategoryScore {
  category: number;
  score: number;
  category_name: string;
  activities: ActivityScore[];
}

export interface ActivityScore {
  activity: number;
  activity_name: string;
  score: number;
  weight: number;
}

export interface ModeScore {
  mode: number;
  score: number;
}

export interface HexagonScore {
  hexagon: number;
  population: number;
  persona_scores: PersonaScore[];
  category_scores: CategoryScore[];
  mode_scores: ModeScore[];
}

export interface FormattedPersona {
  name: string;
  id: number;
}

export interface FormattedCategory {
  name: string;
  id: number;
  weight: number;
}

export interface FormattedMode {
  name: string;
  id: number;
}

export interface ProjectDetails {
  project: {
    id: number;
    name: string;
    description: string;
  },
  metadata: {
    "maptype": string;
    "featureId": string;
  },
  personas: FormattedPersona[];
  categories: FormattedCategory[];
  modes: FormattedMode[];
  hexagons: HexagonScore[];
}