export interface Project {
    display_name: string;
    description: string;
    owner: string | null;
    is_mid: boolean;
    category: string | null;
    status: string;
    created: Date;
    version: string;
}