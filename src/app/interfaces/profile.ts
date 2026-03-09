export interface Mode {
    id: number;
    name: string;
    display_name: string;
}

export interface Profile {
    id: number;
    name: string;
    display_name: string;
    description?: string;
    mode: Mode;
}

export interface ProfileCombination {
    id: number;
    display_name: string;
    profile_ids: number[];
}