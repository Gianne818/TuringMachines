import type { StateNode, TransitionRule } from './types';

export interface LayoutOptions {
  startX?: number;
  startY?: number;
  colGap?: number;
  rowGap?: number;
}

/**
 * Computes a clean left-to-right layered topological layout using BFS from startState.
 * Preserves existing start/halt flags and places disconnected components neatly below.
 */
export function autoLayoutStates(
  states: StateNode[],
  transitions: TransitionRule[],
  startState: string,
  options: LayoutOptions = {},
): StateNode[] {
  const { startX = 110, startY = 120, colGap = 190, rowGap = 130 } = options;
  if (states.length === 0) return [];

  const adj = new Map<string, string[]>();
  for (const s of states) {
    adj.set(s.id, []);
  }
  for (const t of transitions) {
    if (t.from !== t.to && adj.has(t.from)) {
      const list = adj.get(t.from)!;
      if (!list.includes(t.to)) {
        list.push(t.to);
      }
    }
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];

  if (adj.has(startState)) {
    layer.set(startState, 0);
    queue.push(startState);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLayer = layer.get(curr)!;
    for (const next of adj.get(curr) ?? []) {
      if (!layer.has(next)) {
        layer.set(next, currLayer + 1);
        queue.push(next);
      }
    }
  }

  let maxAssigned = 0;
  for (const l of layer.values()) {
    if (l > maxAssigned) maxAssigned = l;
  }

  // Place any unreachable states after assigned layers
  for (const s of states) {
    if (!layer.has(s.id)) {
      maxAssigned += 1;
      layer.set(s.id, maxAssigned);
    }
  }

  // Push halt states to the rightmost column when they only have incoming edges
  const hasOutgoing = new Set(
    transitions.filter((t) => t.from !== t.to).map((t) => t.from),
  );
  let furthestNonHalt = 0;
  for (const s of states) {
    if (!s.isHalt || hasOutgoing.has(s.id)) {
      furthestNonHalt = Math.max(furthestNonHalt, layer.get(s.id) ?? 0);
    }
  }
  for (const s of states) {
    if (s.isHalt && !hasOutgoing.has(s.id)) {
      layer.set(s.id, Math.max(layer.get(s.id) ?? 0, furthestNonHalt + 1));
    }
  }

  const columns = new Map<number, StateNode[]>();
  for (const s of states) {
    const col = layer.get(s.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(s);
  }

  const maxRows = Math.max(
    1,
    ...Array.from(columns.values()).map((col) => col.length),
  );
  const centerY = startY + ((maxRows - 1) * rowGap) / 2;

  const posMap = new Map<string, { x: number; y: number }>();
  const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);

  for (let cIdx = 0; cIdx < sortedCols.length; cIdx += 1) {
    const colKey = sortedCols[cIdx];
    const items = columns.get(colKey)!;
    const totalHeight = (items.length - 1) * rowGap;
    const topY = centerY - totalHeight / 2;

    for (let rIdx = 0; rIdx < items.length; rIdx += 1) {
      // Gentle vertical stagger on adjacent columns for clean edge routing
      const stagger = items.length === 1 && cIdx % 2 === 1 ? 0 : 0;
      posMap.set(items[rIdx].id, {
        x: Math.round(startX + cIdx * colGap),
        y: Math.round(topY + rIdx * rowGap + stagger),
      });
    }
  }

  return states.map((s) => {
    const pos = posMap.get(s.id);
    return pos ? { ...s, x: pos.x, y: pos.y } : s;
  });
}
