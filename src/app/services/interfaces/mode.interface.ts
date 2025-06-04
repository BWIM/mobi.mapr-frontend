export interface Profile {
    id: number;
    name: string;
    display_name: string;
}

export interface Mode {
    id: number;
    name: string;
    display_name: string;
    profiles: Profile[];
} 