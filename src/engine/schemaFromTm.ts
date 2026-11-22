import type {
  Direction,
  SchemaDiagram,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from './types';

interface ActionSummary {
  text: string | null;
  writes: Set<string>;
  moves: Set<Direction>;
  singleWrite: string | null;
  singleMove: Direction | null;
  allPreserve: boolean;
  mutates: boolean;
  swapLabel: string | null;
}

function summarizeRules(rules: TransitionRule[]): ActionSummary {
  if (rules.length === 0) {
    return {
      text: null,
      writes: new Set(),
      moves: new Set(),
      singleWrite: null,
      singleMove: null,
      allPreserve: true,
      mutates: false,
      swapLabel: null,
    };
  }

  const moves = new Set<Direction>(rules.map((r) => r.move));
  const singleMove = moves.size === 1 ? Array.from(moves)[0] : null;
  const effectiveWrites = rules.map((r) => (r.write === '*' ? r.read : r.write));
  const writes = new Set(effectiveWrites);
  const singleWrite = writes.size === 1 ? Array.from(writes)[0] : null;
  const allPreserve = rules.every((r) => r.write === '*' || r.write === r.read);
  const mutates = !allPreserve;

  // Detect 2-symbol toggle such as 0 <-> 1
  let swapLabel: string | null = null;
  if (rules.length === 2) {
    const [r0, r1] = rules;
    const w0 = effectiveWrites[0];
    const w1 = effectiveWrites[1];
    if (r0.read === w1 && r1.read === w0 && r0.read !== w0) {
      const sorted = [r0.read, r1.read].sort();
      swapLabel = `${sorted[0]}↔${sorted[1]}`;
    }
  }

  let text: string | null = null;
  if (allPreserve) {
    if (singleMove && singleMove !== 'S') {
      text = singleMove;
    } else if (singleMove === 'S' && singleWrite) {
      text = singleWrite;
    }
  } else if (singleWrite !== null) {
    text = singleMove && singleMove !== 'S' ? `${singleWrite} ${singleMove}` : singleWrite;
  } else if (swapLabel !== null) {
    text = singleMove && singleMove !== 'S' ? `${swapLabel} ${singleMove}` : swapLabel;
  }

  return {
    text,
    writes,
    moves,
    singleWrite,
    singleMove,
    allPreserve,
    mutates,
    swapLabel,
  };
}

interface NodePresentation {
  label: string;
  kind: SchemaNode['kind'];
  variant?: 'accept' | 'reject';
  nodeSummary?: ActionSummary;
}

function deriveNodePresentation(
  state: StateNode,
  machine: TuringMachineDefinition,
  haltSet: Set<string>,
): NodePresentation {
  const isStart = state.id === machine.startState;
  const isHalt = haltSet.has(state.id) || Boolean(state.isHalt);
  const outgoing = machine.transitions.filter((t) => t.from === state.id);
  const outgoingSelf = outgoing.filter((t) => t.to === state.id);

  if (isStart) {
    const primary = outgoingSelf.length > 0 ? outgoingSelf : outgoing;
    const summary = summarizeRules(primary);
    const label = summary.text ? `> ${summary.text}` : '> Step';
    let variant: 'accept' | 'reject' | undefined;
    const incoming = machine.transitions.filter((t) => t.to === state.id);
    if (isHalt) {
      const inSum = summarizeRules(incoming);
      if (inSum.writes.size === 1 && inSum.writes.has('Ⓨ')) variant = 'accept';
      else if (inSum.writes.size === 1 && inSum.writes.has('Ⓝ')) variant = 'reject';
    }
    return {
      label,
      kind: 'start-action',
      variant,
      nodeSummary: summary.text ? summary : undefined,
    };
  }

  if (isHalt) {
    const incoming = machine.transitions.filter((t) => t.to === state.id);
    const inSum = summarizeRules(incoming);
    if (inSum.writes.size === 1 && inSum.writes.has('Ⓨ')) {
      return {
        label: inSum.text ?? 'Ⓨ',
        kind: 'halt',
        variant: 'accept',
        nodeSummary: inSum.text ? inSum : undefined,
      };
    }
    if (inSum.writes.size === 1 && inSum.writes.has('Ⓝ')) {
      return {
        label: inSum.text ?? 'Ⓝ',
        kind: 'halt',
        variant: 'reject',
        nodeSummary: inSum.text ? inSum : undefined,
      };
    }
    if (inSum.writes.has('Ⓨ') && inSum.writes.has('Ⓝ')) {
      return { label: 'Halt', kind: 'halt' };
    }
    return {
      label: inSum.text ?? 'Halt',
      kind: 'halt',
      nodeSummary: inSum.text ? inSum : undefined,
    };
  }

  if (outgoingSelf.length > 0) {
    const selfSum = summarizeRules(outgoingSelf);
    const fallbackMove = selfSum.singleMove && selfSum.singleMove !== 'S' ? selfSum.singleMove : null;
    const label = selfSum.text ?? fallbackMove ?? 'Scan';
    const capturedSummary = selfSum.text
      ? selfSum
      : fallbackMove
        ? {
            text: fallbackMove,
            writes: new Set<string>(),
            moves: new Set<Direction>([fallbackMove]),
            singleWrite: null,
            singleMove: fallbackMove,
            allPreserve: true,
            mutates: false,
            swapLabel: null,
          }
        : undefined;
    return {
      label,
      kind: selfSum.mutates ? 'write' : 'move',
      nodeSummary: capturedSummary,
    };
  }

  const outSum = summarizeRules(outgoing);
  if (outSum.text && outSum.mutates) {
    return { label: outSum.text, kind: 'write', nodeSummary: outSum };
  }
  if (outSum.text) {
    return { label: outSum.text, kind: 'move', nodeSummary: outSum };
  }

  const distinctTargets = new Set(outgoing.map((r) => r.to));
  return {
    label: distinctTargets.size > 1 ? 'Branch' : 'Step',
    kind: 'branch',
  };
}

function computeLayeredPositions(
  nodes: Array<{ id: string; label: string; isHalt: boolean }>,
  transitions: TransitionRule[],
  startState: string,
): { positions: Map<string, { x: number; y: number }>; layers: Map<string, number> } {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const t of transitions) {
    if (t.from !== t.to && adj.has(t.from)) {
      const list = adj.get(t.from)!;
      if (!list.includes(t.to)) list.push(t.to);
    }
  }

  const layers = new Map<string, number>();
  const queue: string[] = [];
  if (adj.has(startState)) {
    layers.set(startState, 0);
    queue.push(startState);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLayer = layers.get(cur)!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!layers.has(nxt)) {
        layers.set(nxt, curLayer + 1);
        queue.push(nxt);
      }
    }
  }

  let maxLayer = 0;
  for (const l of layers.values()) {
    if (l > maxLayer) maxLayer = l;
  }
  for (const n of nodes) {
    if (!layers.has(n.id)) {
      maxLayer += 1;
      layers.set(n.id, maxLayer);
    }
  }

  const hasNonSelfOut = new Set(
    transitions.filter((t) => t.from !== t.to).map((t) => t.from),
  );
  let furthestNonHalt = 0;
  for (const n of nodes) {
    if (!n.isHalt || hasNonSelfOut.has(n.id)) {
      furthestNonHalt = Math.max(furthestNonHalt, layers.get(n.id) ?? 0);
    }
  }
  for (const n of nodes) {
    if (n.isHalt && !hasNonSelfOut.has(n.id)) {
      layers.set(n.id, Math.max(layers.get(n.id) ?? 0, furthestNonHalt + 1));
    }
  }

  const columns = new Map<number, Array<{ id: string; label: string; isHalt: boolean }>>();
  for (const n of nodes) {
    const col = layers.get(n.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(n);
  }

  const maxLabelLen = Math.max(4, ...nodes.map((n) => n.label.replace(/^>\s*/, '').length));
  const colGap = Math.max(165, Math.min(230, Math.round(maxLabelLen * 8.5 + 105)));
  const rowGap = 115;
  const startX = 115;
  const startY = 125;

  const maxRows = Math.max(1, ...Array.from(columns.values()).map((c) => c.length));
  const centerY = startY + ((maxRows - 1) * rowGap) / 2;

  const positions = new Map<string, { x: number; y: number }>();
  const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);

  for (let cIdx = 0; cIdx < sortedCols.length; cIdx += 1) {
    const items = columns.get(sortedCols[cIdx])!;
    const totalH = (items.length - 1) * rowGap;
    const topY = centerY - totalH / 2;
    for (let rIdx = 0; rIdx < items.length; rIdx += 1) {
      const staggerX = items.length >= 3 && rIdx % 2 === 1 ? 28 : 0;
      positions.set(items[rIdx].id, {
        x: Math.round(startX + cIdx * colGap + staggerX),
        y: Math.round(topY + rIdx * rowGap),
      });
    }
  }

  return { positions, layers };
}

/**
 * Derives a circle-free Lewis & Papadimitriou action schema diagram directly from
 * a Turing machine's state and transition table when no hand-crafted schema exists.
 */
export function deriveLpSchemaFromTm(machine: TuringMachineDefinition): SchemaDiagram {
  const blank = machine.blankSymbol || '#';
  const haltSet = new Set(machine.haltStates);

  if (machine.states.length === 0) {
    return {
      title: `${machine.name} — L&P Schema`,
      width: 440,
      height: 220,
      nodes: [
        { id: machine.startState || 'start', label: '> Step', kind: 'start-action', x: 140, y: 110 },
        { id: 'halt', label: 'Halt', kind: 'halt', x: 310, y: 110 },
      ],
      edges: [{ id: 'e_0', from: machine.startState || 'start', to: 'halt', label: blank }],
    };
  }

  const nodeDrafts = machine.states.map((s) => {
    const pres = deriveNodePresentation(s, machine, haltSet);
    return {
      id: s.id,
      ...pres,
      isHalt: haltSet.has(s.id) || Boolean(s.isHalt),
    };
  });

  const { positions, layers } = computeLayeredPositions(
    nodeDrafts,
    machine.transitions,
    machine.startState,
  );

  const nodes: SchemaNode[] = nodeDrafts.map((d) => {
    const pos = positions.get(d.id) ?? { x: 140, y: 125 };
    return {
      id: d.id,
      label: d.label,
      kind: d.kind,
      variant: d.variant,
      x: pos.x,
      y: pos.y,
    };
  });
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group transitions by (from, to)
  const grouped = new Map<string, TransitionRule[]>();
  for (const t of machine.transitions) {
    if (!nodeMap.has(t.from) || !nodeMap.has(t.to)) continue;
    const key = `${t.from}\0${t.to}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const knownNonBlanks = Array.from(
    new Set(
      [
        ...machine.inputAlphabet,
        ...machine.tapeAlphabet,
        ...machine.transitions.map((t) => t.read),
      ].filter((s) => s !== blank && s !== '*' && s !== 'Ⓨ' && s !== 'Ⓝ'),
    ),
  );

  const draftMap = new Map(nodeDrafts.map((d) => [d.id, d]));

  const actionsMatchSummary = (
    edgeSum: ActionSummary,
    nodeSum: ActionSummary | undefined,
  ): boolean => {
    if (!nodeSum || !nodeSum.text || !edgeSum.singleMove) return false;
    if (edgeSum.allPreserve) {
      return nodeSum.allPreserve && edgeSum.singleMove === nodeSum.singleMove;
    }
    if (edgeSum.singleWrite !== null) {
      return (
        edgeSum.singleWrite === nodeSum.singleWrite &&
        edgeSum.singleMove === nodeSum.singleMove
      );
    }
    if (edgeSum.swapLabel !== null) {
      return (
        edgeSum.swapLabel === nodeSum.swapLabel &&
        edgeSum.singleMove === nodeSum.singleMove
      );
    }
    return false;
  };

  const formatPerRuleActions = (
    rules: TransitionRule[],
    capturedMove: Direction | null | undefined,
  ): string => {
    const parts = rules.slice(0, 3).map((r) => {
      const effWrite = r.write === '*' ? r.read : r.write;
      const mut = effWrite !== r.read;
      const diffMove = capturedMove ? r.move !== capturedMove : true;
      if (mut && diffMove) return `${r.read}→${effWrite}, ${r.move}`;
      if (mut) return `${r.read}→${effWrite}`;
      if (diffMove) return `${r.read}, ${r.move}`;
      return r.read;
    });
    return rules.length > 3 ? `${parts.slice(0, 2).join(' · ')}…` : parts.join(' · ');
  };

  const edges: SchemaEdge[] = [];
  let edgeIdx = 0;

  for (const [, rules] of grouped.entries()) {
    const from = rules[0].from;
    const to = rules[0].to;
    const reads = Array.from(new Set(rules.map((r) => r.read)));
    const hasBlankExitElsewhere = machine.transitions.some(
      (t) => t.from === from && t.read === blank && t.to !== to,
    );

    let readLabel: string;
    if (reads.includes('*')) {
      readLabel = 'σ';
    } else if (
      !reads.includes(blank) &&
      knownNonBlanks.length >= 3 &&
      knownNonBlanks.every((sym) => reads.includes(sym)) &&
      hasBlankExitElsewhere
    ) {
      readLabel = `σ ≠ ${blank}`;
    } else if (reads.length <= 3) {
      readLabel = reads.join(', ');
    } else {
      readLabel = `${reads.slice(0, 2).join(', ')}…`;
    }

    const fromDraft = draftMap.get(from);
    const toNode = nodeMap.get(to)!;
    const toDraft = draftMap.get(to);
    const edgeSum = summarizeRules(rules);

    if (from === to) {
      let selfLabel = readLabel;
      if (!actionsMatchSummary(edgeSum, fromDraft?.nodeSummary)) {
        if (edgeSum.allPreserve && edgeSum.singleMove) {
          selfLabel = `${readLabel}, ${edgeSum.singleMove}`;
        } else if (edgeSum.singleWrite !== null && edgeSum.singleMove) {
          const sameMove = edgeSum.singleMove === fromDraft?.nodeSummary?.singleMove;
          selfLabel = sameMove
            ? `${readLabel} → ${edgeSum.singleWrite}`
            : `${readLabel} → ${edgeSum.singleWrite}, ${edgeSum.singleMove}`;
        } else {
          selfLabel = formatPerRuleActions(rules, fromDraft?.nodeSummary?.singleMove);
        }
      }
      edges.push({
        id: `e_${edgeIdx++}`,
        from,
        to,
        label: selfLabel,
        isSelfLoop: true,
        loopAngleDeg: -90,
      });
      continue;
    }

    let label: string = readLabel;
    if (toNode.kind === 'halt') {
      if (!actionsMatchSummary(edgeSum, toDraft?.nodeSummary)) {
        if (edgeSum.singleWrite === 'Ⓨ' || edgeSum.singleWrite === 'Ⓝ') {
          const moveCapturedOrStay =
            edgeSum.singleMove === 'S' || edgeSum.singleMove === toDraft?.nodeSummary?.singleMove;
          label = moveCapturedOrStay
            ? `${readLabel} → ${edgeSum.singleWrite}`
            : `${readLabel} → ${edgeSum.singleWrite}, ${edgeSum.singleMove}`;
        } else if (edgeSum.allPreserve && edgeSum.singleMove) {
          label = `${readLabel}, ${edgeSum.singleMove}`;
        } else if (edgeSum.singleWrite !== null && edgeSum.singleMove) {
          label =
            edgeSum.singleMove === 'S'
              ? `${readLabel} → ${edgeSum.singleWrite}`
              : `${readLabel} → ${edgeSum.singleWrite}, ${edgeSum.singleMove}`;
        } else {
          label = formatPerRuleActions(rules, toDraft?.nodeSummary?.singleMove);
        }
      }
    } else if (!actionsMatchSummary(edgeSum, fromDraft?.nodeSummary)) {
      if (edgeSum.allPreserve && edgeSum.singleMove) {
        label = `${readLabel}, ${edgeSum.singleMove}`;
      } else if (edgeSum.singleWrite !== null && edgeSum.singleMove) {
        const sameMove = edgeSum.singleMove === fromDraft?.nodeSummary?.singleMove;
        label = sameMove
          ? `${readLabel} → ${edgeSum.singleWrite}`
          : `${readLabel} → ${edgeSum.singleWrite}, ${edgeSum.singleMove}`;
      } else {
        label = formatPerRuleActions(rules, fromDraft?.nodeSummary?.singleMove);
      }
    }

    const hasReverse = grouped.has(`${to}\0${from}`);
    let curveOffset = 0;
    if (hasReverse) {
      const fromLayer = layers.get(from) ?? 0;
      const toLayer = layers.get(to) ?? 0;
      const fromPos = positions.get(from)!;
      const toPos = positions.get(to)!;
      if (fromPos.x !== toPos.x && (fromLayer > toLayer || (fromLayer === toLayer && from > to))) {
        curveOffset = -58;
      }
    }

    edges.push({
      id: `e_${edgeIdx++}`,
      from,
      to,
      label,
      ...(curveOffset !== 0 ? { curveOffset } : {}),
    });
  }

  const maxX = Math.max(...nodes.map((n) => n.x), 300);
  const maxY = Math.max(...nodes.map((n) => n.y), 160);

  return {
    title: `${machine.name} — L&P Schema`,
    width: Math.max(480, maxX + 125),
    height: Math.max(250, maxY + 100),
    nodes,
    edges,
  };
}
