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
  created: Date;
  status: string;

  projectgroup?: ProjectGroup;  // ProjectGroup ID
  build_hexagons?: boolean;

  version: number;
  project_type?: 'personal' | 'shared' | 'public';  // New property for project visibility
  is_shared?: boolean;  // Legacy property for backward compatibility
  difference?: boolean;  // Property to identify difference maps
  baseline_project_name?: string;
  comparison_project_name?: string;
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
  status?: string;
  projectgroup?: string;
}

export interface ProjectGroupCreateUpdate {
  name: string;
  description?: string;
  status?: string;
}

export interface ProjectInfo {
  id: number;
  display_name: string;
  description: string;
  activities: string[];
  profiles: string[];
  personas: string[];
  type: string;
  baseline_project_name?: string;
  comparison_project_name?: string;
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

export interface ProfileScore {
  profile: number;
  score: number;
}

export interface HexagonScore {
  hexagon: number;
  population: number;
  persona_scores: PersonaScore[];
  category_scores: CategoryScore[];
  profile_scores: ProfileScore[];
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

export interface FormattedProfile {
  name: string;
  id: number;
}

export interface ProjectDetails {
  error?: string;
  project: {
    id: number;
    name: string;
    description: string;
  },
  metadata: {
    "maptype": string;
    "featureId": string;
  },
  personas?: FormattedPersona[];
  categories: FormattedCategory[];
  profiles: FormattedProfile[];
  hexagons: HexagonScore[];
}

export interface PublicSharedProject {
  id: number;
  display_name: string;
  description: string;
  calculated: number;
  projectgroup: {
    id: number;
    name: string;
    user: number;
    description: string;
    default: boolean;
  };
  version: string;
  project_type: string;
  finished: boolean;
  share_key: string;
}

export interface PublicSharedProjectsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PublicSharedProject[];
}

export interface RegioStar {
  id: number;
  name: string;
  regiostar7: number;
}