import { ProjectGroup } from './project-group';
import { ShareInfo } from './share';

export interface Project {
    id: number;
    display_name: string;
    description: string;
    owner: string | null;
    status: string;
    created: Date;
    version: string;
    /** With a share key, already limited to the share's profiles. */
    base_profiles: number[];
    /**
     * Groups of the project (with a share key: only the groups visible through the share).
     * Detail / share-key responses include each group's ordered `projects`; list rows only
     * `{id, display_name}`.
     */
    groups: ProjectGroup[];
    pin?: boolean;
    score_colors?: Record<string, string> | null;
    blog_url?: string | null;
    license_info?: string | null;
    can_edit?: boolean;
    /** Present on detail / share-key responses requested with `?key=`. */
    share?: ShareInfo;
}
