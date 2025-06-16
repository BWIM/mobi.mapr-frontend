export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
  }
  
  export interface MunicipalityScore {
    gemeinde: {
      id: number;
      name: string;
      population: number;
      population_density: number;
    };
    score_avg: number;
    score_pop: number;
  }
  
  export interface CountyScore {
    landkreis: {
      id: number;
      name: string;
      population: number;
      population_density: number;
    };
    score_avg: number;
    score_pop: number;
  }
  
  export interface StateScore {
    land: {
      id: number;
      name: string;
      population: number;
      population_density: number;
    };
    score_avg: number;
    score_pop: number;
  }