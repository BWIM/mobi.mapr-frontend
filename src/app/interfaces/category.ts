import { CompositionNode } from './composition';

export interface Category {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  wegezweck: string;
  /** Structured AND/OR/SUBST tree from the API; null when unset. */
  combination?: CompositionNode | null;
  combination_expr?: string | null;
}
