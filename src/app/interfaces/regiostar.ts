export interface RegioStarClass {
    id: number;
    display_name: string;
}

export interface RegioStar {
    id: number;
    name: string;
    class_name: RegioStarClass;
}