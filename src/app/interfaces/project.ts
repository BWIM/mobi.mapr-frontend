import { ProjectGroup } from './project-group';

export interface Project {
    id: number;
    display_name: string;
    description: string;
    owner: string | null;
    status: string;
    created: Date;
    version: string;
    base_profiles: number[];
    group_id?: number | null;
    group?: ProjectGroup | null;
    pin?: boolean;
    score_colors?: Record<string, string> | null;
    blog_url?: string | null;
    license_info?: string | null;
}

export function projectGroupId(project: Pick<Project, 'group_id' | 'group'>): number | null {
    return project.group_id ?? project.group?.id ?? null;
}
