export interface ProjectGroup {
    id: string;
    user: string;  // User ID
    name: string;
    description?: string;
    default: boolean;
}

export interface Project {
    id: string;
    display_name?: string;
    description?: string;
    calculated: number;
    areas: number;
    
    type?: string;
    default: boolean;
    created: Date;
    
    finished: boolean;
    projectgroup?: ProjectGroup;  // ProjectGroup ID
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