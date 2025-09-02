export interface Profile {
    id: number;
    name: string;
    display_name: string;
    mode_default: boolean;
}

export interface Mode {
    id: number;
    name: string;
    display_name: string;
    profiles: Profile[];
} 