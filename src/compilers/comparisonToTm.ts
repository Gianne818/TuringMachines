import { autoLayoutStates } from '../engine/layout';
import type {
  MachineKind,
  SampleInput,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import type { ComparisonOp, ComparisonSpec, CompileResult } from './types';

function makeRule(
  id: string,
  from: string,
  read: string,
  to: string,
  write: string,
  move: 'L' | 'R' | 'S',
): TransitionRule {
  return { id, from, read, to, write, move };
}

interface OutcomeConfig {
  kind: MachineKind;
  ltSym: string;
  eqSym: string;
  gtSym: string;
  titleOp: string;
  descOp: string;
}

const OUTCOME_CONFIG: Record<ComparisonOp, OutcomeConfig> = {
  eq: { kind: 'decider', ltSym: 'Ⓝ', eqSym: 'Ⓨ', gtSym: 'Ⓝ', titleOp: '=', descOp: 'equality (A = B)' },
  neq: { kind: 'decider', ltSym: 'Ⓨ', eqSym: 'Ⓝ', gtSym: 'Ⓨ', titleOp: '≠', descOp: 'inequality (A ≠ B)' },
  gt: { kind: 'decider', ltSym: 'Ⓝ', eqSym: 'Ⓝ', gtSym: 'Ⓨ', titleOp: '>', descOp: 'strictly greater than (A > B)' },
  gte: { kind: 'decider', ltSym: 'Ⓝ', eqSym: 'Ⓨ', gtSym: 'Ⓨ', titleOp: '≥', descOp: 'greater than or equal (A ≥ B)' },
  lt: { kind: 'decider', ltSym: 'Ⓨ', eqSym: 'Ⓝ', gtSym: 'Ⓝ', titleOp: '<', descOp: 'strictly less than (A < B)' },
  lte: { kind: 'decider', ltSym: 'Ⓨ', eqSym: 'Ⓨ', gtSym: 'Ⓝ', titleOp: '≤', descOp: 'less than or equal (A ≤ B)' },
  'three-way': { kind: 'transducer', ltSym: '<', eqSym: '=', gtSym: '>', titleOp: '<, =, >', descOp: 'three-way ordering (<, =, >)' },
};

function verdictFor(sym: string): 'accept' | 'reject' | undefined {
  if (sym === 'Ⓨ') return 'accept';
  if (sym === 'Ⓝ') return 'reject';
  return undefined;
}

function tagForOutcome(sym: string): string {
  if (sym === 'Ⓨ') return 'Y';
  if (sym === 'Ⓝ') return 'N';
  if (sym === '<') return 'lt';
  if (sym === '=') return 'eq';
  return 'gt';
}

function buildUnaryComparison(op: ComparisonOp): TuringMachineDefinition {
  const cfg = OUTCOME_CONFIG[op];
  const uniqueTags = Array.from(new Set([cfg.ltSym, cfg.eqSym, cfg.gtSym])).map((sym) => ({
    sym,
    tag: tagForOutcome(sym),
  }));
  const ltTag = tagForOutcome(cfg.ltSym);
  const eqTag = tagForOutcome(cfg.eqSym);
  const gtTag = tagForOutcome(cfg.gtSym);

  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_chkN' },
    { id: 'q1', label: 'Check n', x: 0, y: 0, schemaNodeId: 'n_chkN' },
    { id: 'q2', label: 'Skip n ←', x: 0, y: 0, schemaNodeId: 'n_skipN_L' },
    { id: 'q3', label: 'Check m', x: 0, y: 0, schemaNodeId: 'n_chkM' },
    { id: 'q4', label: 'Rewind m', x: 0, y: 0, schemaNodeId: 'n_eraseM' },
    { id: 'q5', label: 'Erase m[0]', x: 0, y: 0, schemaNodeId: 'n_eraseM' },
    { id: 'q6', label: 'Return →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q7', label: 'Skip n →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q_chkM_end', label: 'n=0, chk m', x: 0, y: 0, schemaNodeId: 'n_wipeGt' },
    { id: 'q_gt', label: `Wipe m (${cfg.gtSym})`, x: 0, y: 0, schemaNodeId: 'n_wipeGt' },
    { id: 'q_lt_sep', label: 'm=0, to n', x: 0, y: 0, schemaNodeId: 'n_wipeLt' },
    { id: 'q_lt_wipe', label: `Wipe n (${cfg.ltSym})`, x: 0, y: 0, schemaNodeId: 'n_wipeLt' },
    ...uniqueTags.map(({ sym, tag }) => ({
      id: `qH_${tag}`,
      label: `Halt (${sym})`,
      x: 0,
      y: 0,
      isHalt: true,
      schemaNodeId: `n_halt_${tag}`,
    })),
  ];

  const transitions: TransitionRule[] = [
    makeRule('uc1', 'q0', '#', 'q1', '#', 'L'),
    makeRule('uc2', 'q1', 'I', 'q2', '#', 'L'),
    makeRule('uc3', 'q1', '#', 'q_chkM_end', '#', 'L'),
    makeRule('uc4', 'q_chkM_end', 'I', 'q_gt', '#', 'L'),
    makeRule('uc5', 'q_chkM_end', '#', `qH_${eqTag}`, cfg.eqSym, 'R'),
    makeRule('uc6', 'q_gt', 'I', 'q_gt', '#', 'L'),
    makeRule('uc7', 'q_gt', '#', `qH_${gtTag}`, cfg.gtSym, 'R'),
    makeRule('uc8', 'q2', 'I', 'q2', 'I', 'L'),
    makeRule('uc9', 'q2', '#', 'q3', '#', 'L'),
    makeRule('uc10', 'q3', 'I', 'q4', 'I', 'L'),
    makeRule('uc11', 'q3', '#', 'q_lt_sep', '#', 'R'),
    makeRule('uc12', 'q4', 'I', 'q4', 'I', 'L'),
    makeRule('uc13', 'q4', '#', 'q5', '#', 'R'),
    makeRule('uc14', 'q5', 'I', 'q6', '#', 'R'),
    makeRule('uc15', 'q6', 'I', 'q6', 'I', 'R'),
    makeRule('uc16', 'q6', '#', 'q7', '#', 'R'),
    makeRule('uc17', 'q7', 'I', 'q7', 'I', 'R'),
    makeRule('uc18', 'q7', '#', 'q0', '#', 'S'),
    makeRule('uc19', 'q_lt_sep', '#', 'q_lt_wipe', '#', 'R'),
    makeRule('uc20', 'q_lt_wipe', 'I', 'q_lt_wipe', '#', 'R'),
    makeRule('uc21', 'q_lt_wipe', '#', `qH_${ltTag}`, cfg.ltSym, 'R'),
  ];

  const haltXs = uniqueTags.length === 3 ? [175, 365, 555] : [220, 470];
  const schemaNodes: SchemaNode[] = [
    { id: 'n_chkN', label: '> L', kind: 'start-action', x: 95, y: 120 },
    { id: 'n_skipN_L', label: 'L_#', kind: 'builtin', builtinId: 'L_hash', x: 270, y: 120 },
    { id: 'n_chkM', label: 'L', kind: 'move', x: 450, y: 120 },
    { id: 'n_eraseM', label: 'L_# R #', kind: 'builtin', builtinId: 'L_hash', x: 635, y: 120 },
    { id: 'n_wipeGt', label: 'E', kind: 'builtin', builtinId: 'E', x: 95, y: 245 },
    { id: 'n_wipeLt', label: 'E', kind: 'builtin', builtinId: 'E', x: 450, y: 245 },
    { id: 'n_ret', label: 'R_# R_#', kind: 'builtin', builtinId: 'R_hash', x: 635, y: 245 },
    ...uniqueTags.map(({ sym, tag }, idx) => ({
      id: `n_halt_${tag}`,
      label: `${sym} R`,
      kind: 'halt' as const,
      variant: verdictFor(sym),
      x: haltXs[idx],
      y: 355,
    })),
  ];

  const schemaEdges: SchemaEdge[] = [
    { id: 'e_1', from: 'n_chkN', to: 'n_skipN_L', label: 'I → #' },
    { id: 'e_2', from: 'n_chkN', to: 'n_wipeGt', label: '#' },
    { id: 'e_3', from: 'n_skipN_L', to: 'n_chkM', label: '#' },
    { id: 'e_4', from: 'n_chkM', to: 'n_eraseM', label: 'I' },
    { id: 'e_5', from: 'n_chkM', to: 'n_wipeLt', label: '#' },
    { id: 'e_6', from: 'n_eraseM', to: 'n_ret', label: '#' },
    { id: 'e_7', from: 'n_ret', to: 'n_chkN', label: '#' },
    ...(eqTag === gtTag
      ? [{ id: 'e_gt', from: 'n_wipeGt', to: `n_halt_${eqTag}`, label: '#, I' }]
      : [
          { id: 'e_eq', from: 'n_wipeGt', to: `n_halt_${eqTag}`, label: '#' },
          { id: 'e_gt', from: 'n_wipeGt', to: `n_halt_${gtTag}`, label: 'I' },
        ]),
    { id: 'e_lt', from: 'n_wipeLt', to: `n_halt_${ltTag}`, label: '#' },
  ];

  const outSyms = uniqueTags.map((u) => u.sym);
  const sampleInputs: SampleInput[] = [
    { label: '3 vs 2', input: '#III#II#', expectedOutput: `#${cfg.gtSym}#`, verdict: verdictFor(cfg.gtSym) },
    { label: '2 vs 2', input: '#II#II#', expectedOutput: `#${cfg.eqSym}#`, verdict: verdictFor(cfg.eqSym) },
    { label: '2 vs 3', input: '#II#III#', expectedOutput: `#${cfg.ltSym}#`, verdict: verdictFor(cfg.ltSym) },
    { label: '0 vs 0', input: '###', expectedOutput: `#${cfg.eqSym}#`, verdict: verdictFor(cfg.eqSym) },
  ];

  return {
    id: `compiled-comp-unary-${op}-${Date.now().toString(36)}`,
    name: `Unary Comparison (${cfg.titleOp})`,
    category: 'comparison',
    kind: cfg.kind,
    description: `Decides/computes ${cfg.descOp} on two unary tallies #I^m#I^n#.`,
    algorithmSummary:
      'Cancels one I from n and one I from m per round. When n or m runs out, wipes any remaining tallies and outputs the comparison result with the head parked on the trailing #.',
    inputFormat: '#I^m#I^n# (e.g., #III#II#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', ...outSyms],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: uniqueTags.map((u) => `qH_${u.tag}`),
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: `Unary Comparison (${cfg.titleOp}) — L&P Schema`,
      width: 750,
      height: 415,
      nodes: schemaNodes,
      edges: schemaEdges,
    },
    sampleInputs,
    isCustom: true,
  };
}

function buildBinaryComparator(op: ComparisonOp): TuringMachineDefinition {
  const cfg = OUTCOME_CONFIG[op];
  const WORK = ['0', '1', 'S', 'Z', 'a', 'b', 'X'];

  const uniqueTags = Array.from(new Set([cfg.ltSym, cfg.eqSym, cfg.gtSym])).map((sym) => ({
    sym,
    tag: tagForOutcome(sym),
  }));

  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_atB', label: 'Find sep ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_rewA', label: 'Rewind A ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_stripA', label: 'Strip 0s (A)', x: 0, y: 0, schemaNodeId: 'n_strip' },
    { id: 'q_toS_stripB', label: 'To sep →', x: 0, y: 0, schemaNodeId: 'n_strip' },
    { id: 'q_stripB', label: 'Strip 0s (B)', x: 0, y: 0, schemaNodeId: 'n_strip' },
    { id: 'q_rew_len', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_strip' },
    { id: 'q_len_pickA', label: 'Len: pick A', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_len_matchB', label: 'Len: to B', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_len_findB', label: 'Len: pick B', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_len_rew', label: 'Len: rew ←', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_len_chkB', label: 'Len: B done?', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_rew_msb', label: 'To MSB ←', x: 0, y: 0, schemaNodeId: 'n_len' },
    { id: 'q_msb_pickA', label: 'MSB: pick A', x: 0, y: 0, schemaNodeId: 'n_msb' },
    { id: 'q_msb_carry0', label: 'Carry 0 →', x: 0, y: 0, schemaNodeId: 'n_msb' },
    { id: 'q_msb_cmp0', label: 'Cmp 0 vs B', x: 0, y: 0, schemaNodeId: 'n_msb' },
    { id: 'q_msb_carry1', label: 'Carry 1 →', x: 0, y: 0, schemaNodeId: 'n_msb' },
    { id: 'q_msb_cmp1', label: 'Cmp 1 vs B', x: 0, y: 0, schemaNodeId: 'n_msb' },
    { id: 'q_msb_rew', label: 'MSB: rew ←', x: 0, y: 0, schemaNodeId: 'n_msb' },
  ];

  for (const { sym, tag } of uniqueTags) {
    rawStates.push({ id: `q_goEnd_${tag}`, label: `End (${sym}) →`, x: 0, y: 0, schemaNodeId: `n_clean_${tag}` });
    rawStates.push({ id: `q_wipe_${tag}`, label: `Wipe (${sym}) ←`, x: 0, y: 0, schemaNodeId: `n_clean_${tag}` });
    rawStates.push({ id: `qH_${tag}`, label: `Halt (${sym})`, x: 0, y: 0, isHalt: true, schemaNodeId: `n_halt_${tag}` });
  }

  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`bc${rid++}`, from, read, to, write, move));
  };

  const ltTag = tagForOutcome(cfg.ltSym);
  const eqTag = tagForOutcome(cfg.eqSym);
  const gtTag = tagForOutcome(cfg.gtSym);

  // Locate separator #, mark as S, rewind to start of A
  add('q0', '#', 'q_atB', '#', 'L');
  add('q_atB', '0', 'q_atB', '0', 'L');
  add('q_atB', '1', 'q_atB', '1', 'L');
  add('q_atB', '#', 'q_rewA', 'S', 'L');
  add('q_rewA', '0', 'q_rewA', '0', 'L');
  add('q_rewA', '1', 'q_rewA', '1', 'L');
  add('q_rewA', '#', 'q_stripA', '#', 'R');

  // Phase 1: mark leading 0s of A and B as Z
  add('q_stripA', '0', 'q_stripA', 'Z', 'R');
  add('q_stripA', '1', 'q_toS_stripB', '1', 'R');
  add('q_stripA', 'S', 'q_stripB', 'S', 'R');
  add('q_toS_stripB', '0', 'q_toS_stripB', '0', 'R');
  add('q_toS_stripB', '1', 'q_toS_stripB', '1', 'R');
  add('q_toS_stripB', 'S', 'q_stripB', 'S', 'R');
  add('q_stripB', '0', 'q_stripB', 'Z', 'R');
  add('q_stripB', '1', 'q_rew_len', '1', 'L');
  add('q_stripB', '#', 'q_rew_len', '#', 'L');
  for (const s of WORK) add('q_rew_len', s, 'q_rew_len', s, 'L');
  add('q_rew_len', '#', 'q_len_pickA', '#', 'R');

  // Phase 2: compare significant bit-lengths while preserving bit values (0->a, 1->b)
  for (const s of ['Z', 'a', 'b']) add('q_len_pickA', s, 'q_len_pickA', s, 'R');
  add('q_len_pickA', '0', 'q_len_matchB', 'a', 'R');
  add('q_len_pickA', '1', 'q_len_matchB', 'b', 'R');
  add('q_len_pickA', 'S', 'q_len_chkB', 'S', 'R');

  add('q_len_matchB', '0', 'q_len_matchB', '0', 'R');
  add('q_len_matchB', '1', 'q_len_matchB', '1', 'R');
  add('q_len_matchB', 'S', 'q_len_findB', 'S', 'R');

  for (const s of ['Z', 'a', 'b']) add('q_len_findB', s, 'q_len_findB', s, 'R');
  add('q_len_findB', '0', 'q_len_rew', 'a', 'L');
  add('q_len_findB', '1', 'q_len_rew', 'b', 'L');
  add('q_len_findB', '#', `q_wipe_${gtTag}`, '#', 'L');

  for (const s of WORK) add('q_len_rew', s, 'q_len_rew', s, 'L');
  add('q_len_rew', '#', 'q_len_pickA', '#', 'R');

  for (const s of ['Z', 'a', 'b']) add('q_len_chkB', s, 'q_len_chkB', s, 'R');
  add('q_len_chkB', '0', `q_goEnd_${ltTag}`, 'X', 'R');
  add('q_len_chkB', '1', `q_goEnd_${ltTag}`, 'X', 'R');
  add('q_len_chkB', '#', 'q_rew_msb', '#', 'L');

  for (const s of WORK) add('q_rew_msb', s, 'q_rew_msb', s, 'L');
  add('q_rew_msb', '#', 'q_msb_pickA', '#', 'R');

  // Phase 3: equal significant lengths -> MSB-to-LSB bit comparison
  for (const s of ['Z', 'X']) add('q_msb_pickA', s, 'q_msb_pickA', s, 'R');
  add('q_msb_pickA', 'a', 'q_msb_carry0', 'X', 'R');
  add('q_msb_pickA', 'b', 'q_msb_carry1', 'X', 'R');
  add('q_msb_pickA', 'S', `q_goEnd_${eqTag}`, 'X', 'R');

  for (const s of ['a', 'b']) {
    add('q_msb_carry0', s, 'q_msb_carry0', s, 'R');
    add('q_msb_carry1', s, 'q_msb_carry1', s, 'R');
  }
  add('q_msb_carry0', 'S', 'q_msb_cmp0', 'S', 'R');
  add('q_msb_carry1', 'S', 'q_msb_cmp1', 'S', 'R');

  for (const s of ['Z', 'X']) {
    add('q_msb_cmp0', s, 'q_msb_cmp0', s, 'R');
    add('q_msb_cmp1', s, 'q_msb_cmp1', s, 'R');
  }
  add('q_msb_cmp0', 'a', 'q_msb_rew', 'X', 'L');
  add('q_msb_cmp0', 'b', `q_goEnd_${ltTag}`, 'X', 'R');
  add('q_msb_cmp1', 'a', `q_goEnd_${gtTag}`, 'X', 'R');
  add('q_msb_cmp1', 'b', 'q_msb_rew', 'X', 'L');

  for (const s of WORK) add('q_msb_rew', s, 'q_msb_rew', s, 'L');
  add('q_msb_rew', '#', 'q_msb_pickA', '#', 'R');

  // Cleanup routines
  for (const { sym, tag } of uniqueTags) {
    for (const s of WORK) {
      add(`q_goEnd_${tag}`, s, `q_goEnd_${tag}`, 'X', 'R');
      add(`q_wipe_${tag}`, s, `q_wipe_${tag}`, '#', 'L');
    }
    add(`q_goEnd_${tag}`, '#', `q_wipe_${tag}`, '#', 'L');
    add(`q_wipe_${tag}`, '#', `qH_${tag}`, sym, 'R');
  }

  const colXs = uniqueTags.length === 3 ? [210, 440, 665] : [255, 540];
  const schemaNodes: SchemaNode[] = [
    { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 125 },
    { id: 'n_strip', label: '0→Z R', kind: 'write', x: 280, y: 125 },
    { id: 'n_len', label: 'a/b L_#', kind: 'builtin', builtinId: 'L_hash', x: 470, y: 125 },
    { id: 'n_msb', label: 'Bit Cmp', kind: 'branch', x: 665, y: 125 },
    ...uniqueTags.map(({ tag }, idx) => ({
      id: `n_clean_${tag}`,
      label: 'E',
      kind: 'builtin' as const,
      builtinId: 'E' as const,
      x: colXs[idx],
      y: 255,
    })),
    ...uniqueTags.map(({ sym, tag }, idx) => ({
      id: `n_halt_${tag}`,
      label: `${sym} R`,
      kind: 'halt' as const,
      variant: verdictFor(sym),
      x: colXs[idx],
      y: 365,
    })),
  ];

  const schemaEdges: SchemaEdge[] = [
    { id: 'e_rew', from: 'n_rew', to: 'n_strip', label: 'S' },
    { id: 'e_str', from: 'n_strip', to: 'n_len', label: '#' },
    { id: 'e_len_eq', from: 'n_len', to: 'n_msb', label: '#' },
    { id: 'e_msb_loop', from: 'n_msb', to: 'n_msb', label: '0=0, 1=1', isSelfLoop: true, loopAngleDeg: -90 },
    ...(gtTag === ltTag
      ? [{ id: 'e_len_neq', from: 'n_len', to: `n_clean_${gtTag}`, label: '|A| ≠ |B|' }]
      : [
          { id: 'e_len_gt', from: 'n_len', to: `n_clean_${gtTag}`, label: '|A| > |B|' },
          { id: 'e_len_lt', from: 'n_len', to: `n_clean_${ltTag}`, label: '|A| < |B|' },
        ]),
    ...(gtTag === eqTag && ltTag !== eqTag
      ? [
          { id: 'e_msb_ge', from: 'n_msb', to: `n_clean_${eqTag}`, label: 'S, 1>0' },
          { id: 'e_msb_lt', from: 'n_msb', to: `n_clean_${ltTag}`, label: '0<1' },
        ]
      : ltTag === eqTag && gtTag !== eqTag
        ? [
            { id: 'e_msb_le', from: 'n_msb', to: `n_clean_${eqTag}`, label: 'S, 0<1' },
            { id: 'e_msb_gt', from: 'n_msb', to: `n_clean_${gtTag}`, label: '1>0' },
          ]
        : gtTag === ltTag
          ? [
              { id: 'e_msb_eq', from: 'n_msb', to: `n_clean_${eqTag}`, label: 'S' },
              { id: 'e_msb_neq', from: 'n_msb', to: `n_clean_${gtTag}`, label: '0≠1' },
            ]
          : [
              { id: 'e_msb_eq', from: 'n_msb', to: `n_clean_${eqTag}`, label: 'S' },
              { id: 'e_msb_lt', from: 'n_msb', to: `n_clean_${ltTag}`, label: '0<1' },
              { id: 'e_msb_gt', from: 'n_msb', to: `n_clean_${gtTag}`, label: '1>0' },
            ]),
    ...uniqueTags.map(({ tag }, idx) => ({
      id: `e_h_${idx}`,
      from: `n_clean_${tag}`,
      to: `n_halt_${tag}`,
      label: '#',
    })),
  ];

  const outSyms = uniqueTags.map((u) => u.sym);
  const sampleInputs: SampleInput[] = [
    { label: '101 vs 101 (5 = 5)', input: '#101#101#', expectedOutput: `#${cfg.eqSym}#`, verdict: verdictFor(cfg.eqSym) },
    { label: '0101 vs 101 (5 = 5)', input: '#0101#101#', expectedOutput: `#${cfg.eqSym}#`, verdict: verdictFor(cfg.eqSym) },
    { label: '1000 vs 111 (8 > 7)', input: '#1000#111#', expectedOutput: `#${cfg.gtSym}#`, verdict: verdictFor(cfg.gtSym) },
    { label: '111 vs 1000 (7 < 8)', input: '#111#1000#', expectedOutput: `#${cfg.ltSym}#`, verdict: verdictFor(cfg.ltSym) },
    { label: '0 vs 0 (###)', input: '###', expectedOutput: `#${cfg.eqSym}#`, verdict: verdictFor(cfg.eqSym) },
  ];

  return {
    id: `compiled-comp-binary-${op}-${Date.now().toString(36)}`,
    name: `Binary Comparison (${cfg.titleOp})`,
    category: 'comparison',
    kind: cfg.kind,
    description: `Unsigned binary magnitude comparator for ${cfg.descOp} over #A#B# (handles unequal lengths and leading zeros).`,
    algorithmSummary:
      'Marks separator # as S and leading 0s as Z, compares significant bit-lengths while preserving bits as a/b (longer significant length wins), then compares equal-length numbers MSB-to-LSB. Cleans all scratch symbols and parks on the trailing #.',
    inputFormat: '#A#B# with A, B ∈ {0, 1}* (e.g., #1010#111#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'S', 'Z', 'a', 'b', 'X', ...outSyms],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: uniqueTags.map((u) => `qH_${u.tag}`),
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 180, rowGap: 110 }),
    transitions,
    schemaDiagram: {
      title: `Binary Comparison (${cfg.titleOp}) — L&P Schema`,
      width: 775,
      height: 430,
      nodes: schemaNodes,
      edges: schemaEdges,
    },
    sampleInputs,
    isCustom: true,
  };
}

export function compileComparisonToTm(spec: ComparisonSpec): CompileResult {
  if (spec.domain === 'unary') {
    return { ok: true, machine: buildUnaryComparison(spec.op) };
  }
  return { ok: true, machine: buildBinaryComparator(spec.op) };
}
