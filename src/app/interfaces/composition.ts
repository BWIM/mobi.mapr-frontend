/** Structured category combination AST from the API (AND / OR / SUBST). */

export interface CompositionAtom {
  op: 'atom';
  activity_id: number;
  name: string;
  display_name: string;
}

export interface CompositionWeightedChild {
  weight: number;
  expr: CompositionNode;
}

export interface CompositionAnd {
  op: 'and';
  children: CompositionWeightedChild[];
}

export interface CompositionOr {
  op: 'or';
  children: CompositionNode[];
}

export interface CompositionSubst {
  op: 'subst';
  primary: CompositionNode;
  substitutes: CompositionWeightedChild[];
}

export type CompositionNode =
  | CompositionAtom
  | CompositionAnd
  | CompositionOr
  | CompositionSubst;

export type CompositionRoleHint = 'primary' | 'substitute';

/** Top-level legend row derived from a composition root. */
export interface CompositionTopLevelItem {
  key: string;
  label: string;
  weight: number;
  activityIds: number[];
  /** True when this row is the SUBST primary. */
  isPrimary?: boolean;
}

export function isCompositionAtom(node: CompositionNode): node is CompositionAtom {
  return node?.op === 'atom';
}

/** Collect all leaf activity IDs under a node (deduped, order preserved). */
export function collectActivityIds(node: CompositionNode | null | undefined): number[] {
  if (!node) {
    return [];
  }
  const seen = new Set<number>();
  const ids: number[] = [];

  const walk = (n: CompositionNode): void => {
    if (n.op === 'atom') {
      if (!seen.has(n.activity_id)) {
        seen.add(n.activity_id);
        ids.push(n.activity_id);
      }
      return;
    }
    if (n.op === 'and') {
      n.children.forEach((c) => walk(c.expr));
      return;
    }
    if (n.op === 'or') {
      n.children.forEach(walk);
      return;
    }
    if (n.op === 'subst') {
      walk(n.primary);
      n.substitutes.forEach((s) => walk(s.expr));
    }
  };

  walk(node);
  return ids;
}

/**
 * 1-based display numbers in composition-panel order.
 * Falls back to `fallbackActivityIds` when there is no composition tree.
 */
export function assignCompositionDisplayNumbers(
  composition: CompositionNode | null | undefined,
  fallbackActivityIds: number[] = []
): Map<number, number> {
  const ordered = composition
    ? collectActivityIds(composition)
    : fallbackActivityIds.filter((id, i, arr) => id != null && arr.indexOf(id) === i);
  const numbers = new Map<number, number>();
  ordered.forEach((id, index) => {
    numbers.set(id, index + 1);
  });
  return numbers;
}

/** Human-readable label for a node (joins OR children with " / "). */
export function compositionNodeLabel(node: CompositionNode): string {
  if (node.op === 'atom') {
    return node.display_name || node.name;
  }
  if (node.op === 'or') {
    return node.children.map(compositionNodeLabel).join(' / ');
  }
  if (node.op === 'and') {
    return node.children.map((c) => compositionNodeLabel(c.expr)).join(' + ');
  }
  if (node.op === 'subst') {
    const primary = compositionNodeLabel(node.primary);
    const subs = node.substitutes.map((s) => compositionNodeLabel(s.expr)).join(', ');
    return subs ? `${primary} (${subs})` : primary;
  }
  return '';
}

/**
 * Derive mini-map legend rows from the root composition (highest level only):
 * - SUBST: primary only (substitutes are detailed in the places dialog)
 * - AND: each weighted child
 * - OR: each child
 * - atom: single row
 */
export function deriveTopLevelLegendItems(
  composition: CompositionNode | null | undefined
): CompositionTopLevelItem[] {
  if (!composition) {
    return [];
  }

  if (composition.op === 'atom') {
    return [
      {
        key: `atom-${composition.activity_id}`,
        label: compositionNodeLabel(composition),
        weight: 1,
        activityIds: [composition.activity_id],
      },
    ];
  }

  if (composition.op === 'and') {
    return composition.children.map((child, index) => ({
      key: `and-${index}-${collectActivityIds(child.expr).join('-')}`,
      label: compositionNodeLabel(child.expr),
      weight: child.weight,
      activityIds: collectActivityIds(child.expr),
    }));
  }

  if (composition.op === 'or') {
    return composition.children.map((child, index) => ({
      key: `or-${index}-${collectActivityIds(child).join('-')}`,
      label: compositionNodeLabel(child),
      weight: 1,
      activityIds: collectActivityIds(child),
    }));
  }

  if (composition.op === 'subst') {
    return [
      {
        key: `subst-primary-${collectActivityIds(composition.primary).join('-')}`,
        label: compositionNodeLabel(composition.primary),
        weight: 1,
        activityIds: collectActivityIds(composition.primary),
        isPrimary: true,
      },
    ];
  }

  return [];
}

/** Sum of weights among SUBST substitutes or AND children (for share %). */
export function weightedChildrenTotal(children: CompositionWeightedChild[]): number {
  return children.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
}

/** Matches backend ERROR_SCORE_SECONDS (250 minutes). */
const FAULTY_SCORE_SECONDS = 250 * 60;

function isFaultyMetric(value: number | null | undefined): boolean {
  return value == null || !Number.isFinite(value) || value === FAULTY_SCORE_SECONDS;
}

/**
 * Evaluate a composition node to a single metric (score seconds or quality index),
 * mirroring backend AND / OR / SUBST semantics in combination_expr.evaluate.
 *
 * @param lookup maps activity_id → metric value (score or index)
 */
export function evaluateCompositionValue(
  node: CompositionNode | null | undefined,
  lookup: (activityId: number) => number | null | undefined
): number | null {
  if (!node) {
    return null;
  }

  const evalNode = (n: CompositionNode): number => {
    if (n.op === 'atom') {
      const value = lookup(n.activity_id);
      if (isFaultyMetric(value)) {
        return FAULTY_SCORE_SECONDS;
      }
      return Number(value);
    }

    if (n.op === 'or') {
      const valid: number[] = [];
      for (const child of n.children) {
        const value = evalNode(child);
        if (!isFaultyMetric(value)) {
          valid.push(value);
        }
      }
      if (valid.length === 0) {
        return FAULTY_SCORE_SECONDS;
      }
      return Math.min(...valid);
    }

    if (n.op === 'and') {
      let totalW = 0;
      let totalS = 0;
      for (const child of n.children) {
        const value = evalNode(child.expr);
        if (isFaultyMetric(value)) {
          return FAULTY_SCORE_SECONDS;
        }
        const weight = Number(child.weight) || 0;
        totalS += value * weight;
        totalW += weight;
      }
      if (totalW === 0) {
        return 0;
      }
      return totalS / totalW;
    }

    if (n.op === 'subst') {
      const primaryValue = evalNode(n.primary);
      if (isFaultyMetric(primaryValue)) {
        return FAULTY_SCORE_SECONDS;
      }
      let totalW = 0;
      let totalS = 0;
      for (const sub of n.substitutes) {
        const subValue = evalNode(sub.expr);
        const term = isFaultyMetric(subValue)
          ? primaryValue
          : Math.min(subValue as number, primaryValue);
        const weight = Number(sub.weight) || 0;
        totalS += term * weight;
        totalW += weight;
      }
      if (totalW === 0) {
        return FAULTY_SCORE_SECONDS;
      }
      return totalS / totalW;
    }

    return FAULTY_SCORE_SECONDS;
  };

  const result = evalNode(node);
  if (isFaultyMetric(result)) {
    return null;
  }
  return result;
}

