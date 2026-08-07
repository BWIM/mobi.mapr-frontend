/** Structured category combination AST from the API (AND / OR / SUBST). */

/** Score/index annotated by the backend on composition nodes (and activities). */
export interface CompositionActivityScore {
  score: number;
  index: number;
}

export interface CompositionAtom {
  op: 'atom';
  activity_id: number;
  name: string;
  display_name: string;
  activityScore?: CompositionActivityScore;
}

export interface CompositionWeightedChild {
  weight: number;
  expr: CompositionNode;
}

export interface CompositionAnd {
  op: 'and';
  children: CompositionWeightedChild[];
  activityScore?: CompositionActivityScore;
}

export interface CompositionOr {
  op: 'or';
  children: CompositionNode[];
  activityScore?: CompositionActivityScore;
}

export interface CompositionSubst {
  op: 'subst';
  primary: CompositionNode;
  substitutes: CompositionWeightedChild[];
  activityScore?: CompositionActivityScore;
}

export type CompositionNode =
  | CompositionAtom
  | CompositionAnd
  | CompositionOr
  | CompositionSubst;

export type CompositionRoleHint = 'primary' | 'substitute';

/** Sum of weights among SUBST substitutes or AND children (for share %). */
export function weightedChildrenTotal(children: CompositionWeightedChild[]): number {
  return children.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
}

/** Stable display label for sorting (atoms use display_name). */
function compositionSortLabel(node: CompositionNode): string {
  if (node.op === 'atom') {
    return (node.display_name || node.name || '').toLocaleLowerCase();
  }
  if (node.op === 'or') {
    return node.children.map(compositionSortLabel).join(' / ');
  }
  if (node.op === 'and') {
    return node.children.map((c) => compositionSortLabel(c.expr)).join(' + ');
  }
  if (node.op === 'subst') {
    return compositionSortLabel(node.primary);
  }
  return '';
}

function compareByLabel(a: CompositionNode, b: CompositionNode): number {
  return compositionSortLabel(a).localeCompare(compositionSortLabel(b), undefined, {
    sensitivity: 'base',
  });
}

/** Weight descending, then alphabetically by label. */
export function sortWeightedChildren(
  children: CompositionWeightedChild[]
): CompositionWeightedChild[] {
  return [...children].sort((a, b) => {
    const byWeight = (Number(b.weight) || 0) - (Number(a.weight) || 0);
    if (byWeight !== 0) {
      return byWeight;
    }
    return compareByLabel(a.expr, b.expr);
  });
}

/** Alphabetically (OR children have no weights). */
export function sortCompositionChildren(children: CompositionNode[]): CompositionNode[] {
  return [...children].sort(compareByLabel);
}
