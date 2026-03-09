export interface Project {
    id: number;
    display_name: string;
    description: string;
    owner: string | null;
    status: string;
    created: Date;
    version: string;
    base_profiles: number[];
}