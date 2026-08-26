export interface Mode {
    id: number;
    name: string;
    display_name: string;
    icon_name?: string;
}

export interface Profile {
    id: number;
    name: string;
    display_name: string;
    description?: string;
    icon_name?: string;
    mode: Mode;
}

/** One selectable transport profile in the left/mobile filter UI. */
export interface ProfileOption {
    id: number;
    name: string;
    display_name: string;
    icon: string;
    modeName: string;
}