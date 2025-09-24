export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface MunicipalityScore {
  gemeinde_id: number;
  name: string;
  landkreis_name: string;
  index_pop: number;
  index_avg?: number;
  score_pop?: number;
  score_avg?: number;
  rank: number;
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
  index_avg: number;
  index_pop: number;
  rank: number;
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
  index_avg: number;
  index_pop: number;
  rank: number;
}