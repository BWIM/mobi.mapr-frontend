export interface Persona {
    id: number;
    name: string;
    display_name: string;
    can_use_car: boolean;
    description?: string;
    default?: boolean;
}