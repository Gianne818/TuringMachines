import { autoLayoutStates } from '../engine/layout';
import { MacroCompiler } from '../engine/macroCompiler';
import type {
  SchemaDiagram,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import type { CompileResult, UnaryArithmeticSpec } from './types';

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

function clampK(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(5, Math.round(raw)));
}

function buildMonus(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_chkN' },
    { id: 'q1', label: 'Check n', x: 0, y: 0, schemaNodeId: 'n_chkN' },
    { id: 'q2', label: 'Skip n ←', x: 0, y: 0, schemaNodeId: 'n_skipN_L' },
    { id: 'q3', label: 'Check m', x: 0, y: 0, schemaNodeId: 'n_chkM' },
    { id: 'q4', label: 'Rewind m', x: 0, y: 0, schemaNodeId: 'n_eraseM' },
    { id: 'q5', label: 'Erase m[0]', x: 0, y: 0, schemaNodeId: 'n_eraseM' },
    { id: 'q6', label: 'Return →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q7', label: 'Skip n →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q8', label: 'To n (m=0)', x: 0, y: 0, schemaNodeId: 'n_wipeN' },
    { id: 'q9', label: 'Wipe n', x: 0, y: 0, schemaNodeId: 'n_wipeN' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' },
  ];

  const transitions: TransitionRule[] = [
    makeRule('m1', 'q0', '#', 'q1', '#', 'L'),
    makeRule('m2', 'q1', 'I', 'q2', '#', 'L'),
    makeRule('m3', 'q1', '#', 'qH', '#', 'S'),
    makeRule('m4', 'q2', 'I', 'q2', 'I', 'L'),
    makeRule('m5', 'q2', '#', 'q3', '#', 'L'),
    makeRule('m6', 'q3', 'I', 'q4', 'I', 'L'),
    makeRule('m7', 'q3', '#', 'q8', '#', 'R'),
    makeRule('m8', 'q4', 'I', 'q4', 'I', 'L'),
    makeRule('m9', 'q4', '#', 'q5', '#', 'R'),
    makeRule('m10', 'q5', 'I', 'q6', '#', 'R'),
    makeRule('m11', 'q6', 'I', 'q6', 'I', 'R'),
    makeRule('m12', 'q6', '#', 'q7', '#', 'R'),
    makeRule('m13', 'q7', 'I', 'q7', 'I', 'R'),
    makeRule('m14', 'q7', '#', 'q0', '#', 'S'),
    makeRule('m15', 'q8', '#', 'q9', '#', 'R'),
    makeRule('m16', 'q9', 'I', 'q9', '#', 'R'),
    makeRule('m17', 'q9', '#', 'qH', '#', 'S'),
  ];

  return {
    id: `compiled-unary-monus-${Date.now().toString(36)}`,
    name: 'Unary Monus (m ∸ n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: 'Computes proper subtraction max(0, m − n) on #I^m#I^n#.',
    algorithmSummary:
      'Cancels one rightmost I of n against one leftmost I of m per round. If n exhausts first, m remains flush at #I^(m-n)#; if m exhausts first, wipes remaining n to #.',
    inputFormat: '#I^m#I^n# (e.g., #III#II# → #I#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 120 }),
    transitions,
    schemaDiagram: {
      title: 'Unary Monus (m ∸ n) — L&P Schema',
      width: 890,
      height: 330,
      nodes: [
        { id: 'n_chkN', label: '> L', kind: 'start-action', x: 95, y: 140 },
        { id: 'n_skipN_L', label: 'L_#', kind: 'builtin', builtinId: 'L_hash', x: 265, y: 140 },
        { id: 'n_chkM', label: 'L', kind: 'move', x: 435, y: 140 },
        { id: 'n_eraseM', label: 'L_# R #', kind: 'builtin', builtinId: 'L_hash', x: 615, y: 140 },
        { id: 'n_ret', label: 'R_# R_#', kind: 'builtin', builtinId: 'R_hash', x: 795, y: 140 },
        { id: 'n_wipeN', label: 'E', kind: 'builtin', builtinId: 'E', x: 435, y: 265 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(m∸n)#', kind: 'halt', x: 265, y: 265 },
      ],
      edges: [
        { id: 'e_1', from: 'n_chkN', to: 'n_skipN_L', label: 'I → #' },
        { id: 'e_2', from: 'n_chkN', to: 'n_halt', label: '#' },
        { id: 'e_3', from: 'n_skipN_L', to: 'n_chkM', label: '#' },
        { id: 'e_4', from: 'n_chkM', to: 'n_eraseM', label: 'I' },
        { id: 'e_5', from: 'n_chkM', to: 'n_wipeN', label: '#' },
        { id: 'e_6', from: 'n_eraseM', to: 'n_ret', label: '#' },
        { id: 'e_7', from: 'n_ret', to: 'n_chkN', label: '#', curveOffset: -66 },
        { id: 'e_8', from: 'n_wipeN', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '3 ∸ 2 = 1', input: '#III#II#', expectedOutput: '#I#' },
      { label: '2 ∸ 3 = 0', input: '#II#III#', expectedOutput: '#' },
      { label: '3 ∸ 0 = 3', input: '#III##', expectedOutput: '#III#' },
      { label: '0 ∸ 0 = 0', input: '###', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildAdd(): TuringMachineDefinition {
  const mc = new MacroCompiler(['I']);
  const sl = mc.createShiftLeft('n_SL', ['S_L']);
  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  sl.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(sl.entry, [halt], { colGap: 165, rowGap: 110 });

  return {
    id: `compiled-unary-add-${Date.now().toString(36)}`,
    name: 'Unary Addition (m + n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: 'Computes m + n on #I^m#I^n# by invoking Shift Left (S_L).',
    algorithmSummary:
      'Executes > S_L from the trailing #: scans left to the separator #, shifts I^n one cell left to close the gap, erases the duplicate trailing I, and halts at #I^(m+n)[#].',
    inputFormat: '#I^m#I^n# (e.g., #III#II# → #IIIII#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Unary Addition = > S_L',
      width: 480,
      height: 220,
      nodes: [
        { id: 'n_SL', label: '> S_L', sublabel: 'Merge #', kind: 'builtin', builtinId: 'S_L', x: 165, y: 115 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(m+n)#', kind: 'halt', x: 340, y: 115 },
      ],
      edges: [{ id: 'e_add', from: 'n_SL', to: 'n_halt', label: '#' }],
    },
    sampleInputs: [
      { label: '3 + 2 = 5', input: '#III#II#', expectedOutput: '#IIIII#' },
      { label: '3 + 0 = 3', input: '#III##', expectedOutput: '#III#' },
      { label: '0 + 2 = 2', input: '##II#', expectedOutput: '#II#' },
      { label: '0 + 0 = 0', input: '###', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildMultiply(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_start' },
    { id: 'q_chkN', label: 'Check n', x: 0, y: 0, schemaNodeId: 'n_start' },
    { id: 'q_wipeM', label: 'n=0 Wipe', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_seekSep', label: 'Seek sep', x: 0, y: 0, schemaNodeId: 'n_rewM' },
    { id: 'q_chkM', label: 'Check m', x: 0, y: 0, schemaNodeId: 'n_rewM' },
    { id: 'q_skipToN0', label: 'm=0 Sep', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_wipeN0', label: 'm=0 Wipe', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_rewM', label: 'Rewind m', x: 0, y: 0, schemaNodeId: 'n_rewM' },
    { id: 'q_loopM', label: 'Loop m', x: 0, y: 0, schemaNodeId: 'n_markM' },
    { id: 'q_goN', label: 'To n →', x: 0, y: 0, schemaNodeId: 'n_markM' },
    { id: 'q_copyN', label: 'Copy n', x: 0, y: 0, schemaNodeId: 'n_copyN' },
    { id: 'q_addP', label: 'Append I', x: 0, y: 0, schemaNodeId: 'n_copyN' },
    { id: 'q_addP_sep', label: 'In prod', x: 0, y: 0, schemaNodeId: 'n_copyN' },
    { id: 'q_backY', label: 'Back Y', x: 0, y: 0, schemaNodeId: 'n_copyN' },
    { id: 'q_backY_n', label: 'Back n', x: 0, y: 0, schemaNodeId: 'n_copyN' },
    { id: 'q_restY', label: 'Restore n', x: 0, y: 0, schemaNodeId: 'n_restN' },
    { id: 'q_backX', label: 'Back X', x: 0, y: 0, schemaNodeId: 'n_restN' },
    { id: 'q_wipeX', label: 'Wipe X', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_skipToN', label: 'To n', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_wipeN', label: 'Wipe n', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_scanP', label: 'To End →', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' },
  ];

  const transitions: TransitionRule[] = [
    makeRule('mu1', 'q0', '#', 'q_chkN', '#', 'L'),
    makeRule('mu2', 'q_chkN', '#', 'q_wipeM', '#', 'L'),
    makeRule('mu3', 'q_chkN', 'I', 'q_seekSep', 'I', 'L'),
    makeRule('mu4', 'q_wipeM', 'I', 'q_wipeM', '#', 'L'),
    makeRule('mu5', 'q_wipeM', '#', 'qH', '#', 'R'),
    makeRule('mu6', 'q_seekSep', 'I', 'q_seekSep', 'I', 'L'),
    makeRule('mu7', 'q_seekSep', '#', 'q_chkM', '#', 'L'),
    makeRule('mu8', 'q_chkM', '#', 'q_skipToN0', '#', 'R'),
    makeRule('mu9', 'q_chkM', 'I', 'q_rewM', 'I', 'L'),
    makeRule('mu10', 'q_skipToN0', '#', 'q_wipeN0', '#', 'R'),
    makeRule('mu11', 'q_wipeN0', 'I', 'q_wipeN0', '#', 'R'),
    makeRule('mu12', 'q_wipeN0', '#', 'qH', '#', 'S'),
    makeRule('mu13', 'q_rewM', 'I', 'q_rewM', 'I', 'L'),
    makeRule('mu14', 'q_rewM', '#', 'q_loopM', '#', 'R'),
    makeRule('mu15', 'q_loopM', 'I', 'q_goN', 'X', 'R'),
    makeRule('mu16', 'q_loopM', '#', 'q_wipeX', '#', 'L'),
    makeRule('mu17', 'q_goN', 'I', 'q_goN', 'I', 'R'),
    makeRule('mu18', 'q_goN', '#', 'q_copyN', '#', 'R'),
    makeRule('mu19', 'q_copyN', 'Y', 'q_copyN', 'Y', 'R'),
    makeRule('mu20', 'q_copyN', 'I', 'q_addP', 'Y', 'R'),
    makeRule('mu21', 'q_copyN', '#', 'q_restY', '#', 'L'),
    makeRule('mu22', 'q_addP', 'I', 'q_addP', 'I', 'R'),
    makeRule('mu23', 'q_addP', '#', 'q_addP_sep', '#', 'R'),
    makeRule('mu24', 'q_addP_sep', 'I', 'q_addP_sep', 'I', 'R'),
    makeRule('mu25', 'q_addP_sep', '#', 'q_backY', 'I', 'L'),
    makeRule('mu26', 'q_backY', 'I', 'q_backY', 'I', 'L'),
    makeRule('mu27', 'q_backY', '#', 'q_backY_n', '#', 'L'),
    makeRule('mu28', 'q_backY_n', 'I', 'q_backY_n', 'I', 'L'),
    makeRule('mu29', 'q_backY_n', 'Y', 'q_copyN', 'Y', 'R'),
    makeRule('mu30', 'q_restY', 'Y', 'q_restY', 'I', 'L'),
    makeRule('mu31', 'q_restY', '#', 'q_backX', '#', 'L'),
    makeRule('mu32', 'q_backX', 'I', 'q_backX', 'I', 'L'),
    makeRule('mu33', 'q_backX', 'X', 'q_loopM', 'X', 'R'),
    makeRule('mu34', 'q_wipeX', 'X', 'q_wipeX', '#', 'L'),
    makeRule('mu35', 'q_wipeX', '#', 'q_skipToN', '#', 'R'),
    makeRule('mu36', 'q_skipToN', '#', 'q_skipToN', '#', 'R'),
    makeRule('mu37', 'q_skipToN', 'I', 'q_wipeN', '#', 'R'),
    makeRule('mu38', 'q_wipeN', 'I', 'q_wipeN', '#', 'R'),
    makeRule('mu39', 'q_wipeN', '#', 'q_scanP', '#', 'R'),
    makeRule('mu40', 'q_scanP', 'I', 'q_scanP', 'I', 'R'),
    makeRule('mu41', 'q_scanP', '#', 'qH', '#', 'S'),
  ];

  return {
    id: `compiled-unary-mul-${Date.now().toString(36)}`,
    name: 'Unary Multiplication (m × n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: 'Computes m × n on #I^m#I^n# by copying I^n once per I of m.',
    algorithmSummary:
      'Handles m=0 or n=0 by erasing to #. Otherwise marks each I of m as X, appends n tallies using marker Y, cleans X and n, and halts at #I^(m×n)[#].',
    inputFormat: '#I^m#I^n# (e.g., #III#II# → #IIIIII#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', 'X', 'Y'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Unary Multiplication (m × n) — L&P Schema',
      width: 750,
      height: 410,
      nodes: [
        { id: 'n_start', label: '> L', kind: 'start-action', x: 95, y: 125 },
        { id: 'n_rewM', label: 'L_#', kind: 'builtin', builtinId: 'L_hash', x: 270, y: 125 },
        { id: 'n_markM', label: 'X R_#', kind: 'write', x: 455, y: 125 },
        { id: 'n_copyN', label: 'Y R_# I', kind: 'write', x: 645, y: 125 },
        { id: 'n_restN', label: 'Y→I L', kind: 'write', x: 455, y: 245 },
        { id: 'n_zero', label: 'E', kind: 'builtin', builtinId: 'E', x: 95, y: 265 },
        { id: 'n_clean', label: '# R_#', kind: 'builtin', builtinId: 'R_hash', x: 645, y: 265 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(m×n)#', kind: 'halt', x: 370, y: 355 },
      ],
      edges: [
        { id: 'e_1', from: 'n_start', to: 'n_rewM', label: 'I' },
        { id: 'e_2', from: 'n_start', to: 'n_zero', label: '#' },
        { id: 'e_3', from: 'n_rewM', to: 'n_markM', label: 'R' },
        { id: 'e_4', from: 'n_rewM', to: 'n_zero', label: 'm = 0' },
        { id: 'e_5', from: 'n_markM', to: 'n_copyN', label: 'I → X' },
        { id: 'e_6', from: 'n_copyN', to: 'n_restN', label: '#' },
        { id: 'e_7', from: 'n_restN', to: 'n_markM', label: 'X' },
        { id: 'e_8', from: 'n_markM', to: 'n_clean', label: '#' },
        { id: 'e_9', from: 'n_clean', to: 'n_halt', label: '#' },
        { id: 'e_10', from: 'n_zero', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '3 × 2 = 6', input: '#III#II#', expectedOutput: '#IIIIII#' },
      { label: '3 × 0 = 0', input: '#III##', expectedOutput: '#' },
      { label: '0 × 2 = 0', input: '##II#', expectedOutput: '#' },
      { label: '0 × 0 = 0', input: '###', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildDivide(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_start' },
    { id: 'q_chkN', label: 'n = 0?', x: 0, y: 0, schemaNodeId: 'n_start' },
    { id: 'q_wipeM', label: 'Wipe m', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_skipN_init', label: 'Mark S', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_chkM_init', label: 'm = 0?', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_wipeN_only', label: 'Wipe n', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_toEnd_markT', label: 'Mark T →', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_pickN', label: 'Pick n ←', x: 0, y: 0, schemaNodeId: 'n_sub' },
    { id: 'q_toS', label: 'To S ←', x: 0, y: 0, schemaNodeId: 'n_sub' },
    { id: 'q_findM', label: 'Consume m', x: 0, y: 0, schemaNodeId: 'n_sub' },
    { id: 'q_backT', label: 'Back T →', x: 0, y: 0, schemaNodeId: 'n_sub' },
    { id: 'q_restY_inc', label: 'Restore n →', x: 0, y: 0, schemaNodeId: 'n_incQ' },
    { id: 'q_appendQ', label: 'Inc q →', x: 0, y: 0, schemaNodeId: 'n_incQ' },
    { id: 'q_backToT', label: 'To T ←', x: 0, y: 0, schemaNodeId: 'n_incQ' },
    { id: 'q_clean_no_inc', label: 'Clean m,n →', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_scanQ', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' },
  ];

  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`dv${rid++}`, from, read, to, write, move));
  };

  add('q0', '#', 'q_chkN', '#', 'L');

  // If n = 0 -> wipe m and halt at #
  add('q_chkN', '#', 'q_wipeM', '#', 'L');
  add('q_chkN', 'I', 'q_skipN_init', 'I', 'L');
  add('q_wipeM', 'I', 'q_wipeM', '#', 'L');
  add('q_wipeM', '#', 'qH', '#', 'R');

  // Mark separator between m and n as S
  add('q_skipN_init', 'I', 'q_skipN_init', 'I', 'L');
  add('q_skipN_init', '#', 'q_chkM_init', 'S', 'L');

  // If m = 0 -> wipe S and n and halt at #
  add('q_chkM_init', '#', 'q_wipeN_only', '#', 'R');
  add('q_chkM_init', 'I', 'q_toEnd_markT', 'I', 'R');
  add('q_wipeN_only', 'S', 'q_wipeN_only', '#', 'R');
  add('q_wipeN_only', 'I', 'q_wipeN_only', '#', 'R');
  add('q_wipeN_only', '#', 'qH', '#', 'S');

  // Mark separator between n and quotient q as T
  add('q_toEnd_markT', 'I', 'q_toEnd_markT', 'I', 'R');
  add('q_toEnd_markT', 'S', 'q_toEnd_markT', 'S', 'R');
  add('q_toEnd_markT', '#', 'q_pickN', 'T', 'L');

  // Subtract n from m round by round
  add('q_pickN', 'Y', 'q_pickN', 'Y', 'L');
  add('q_pickN', 'I', 'q_toS', 'Y', 'L');
  add('q_pickN', 'S', 'q_restY_inc', 'S', 'R');

  add('q_toS', 'I', 'q_toS', 'I', 'L');
  add('q_toS', 'S', 'q_findM', 'S', 'L');

  add('q_findM', 'X', 'q_findM', 'X', 'L');
  add('q_findM', 'I', 'q_backT', 'X', 'R');
  add('q_findM', '#', 'q_clean_no_inc', '#', 'R');

  for (const s of ['X', 'S', 'I', 'Y']) {
    add('q_backT', s, 'q_backT', s, 'R');
  }
  add('q_backT', 'T', 'q_pickN', 'T', 'L');

  // Full n subtracted -> restore Y->I and append one I to quotient q
  add('q_restY_inc', 'Y', 'q_restY_inc', 'I', 'R');
  add('q_restY_inc', 'T', 'q_appendQ', 'T', 'R');

  add('q_appendQ', 'I', 'q_appendQ', 'I', 'R');
  add('q_appendQ', '#', 'q_backToT', 'I', 'L');

  add('q_backToT', 'I', 'q_backToT', 'I', 'L');
  add('q_backToT', 'T', 'q_pickN', 'T', 'L');

  // m < n remaining -> erase m, S, n, T, scan across q to trailing #
  for (const s of ['X', 'S', 'I', 'Y']) {
    add('q_clean_no_inc', s, 'q_clean_no_inc', '#', 'R');
  }
  add('q_clean_no_inc', 'T', 'q_scanQ', '#', 'R');
  add('q_scanQ', 'I', 'q_scanQ', 'I', 'R');
  add('q_scanQ', '#', 'qH', '#', 'S');

  return {
    id: `compiled-unary-div-${Date.now().toString(36)}`,
    name: 'Unary Integer Division (⌊m ÷ n⌋)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Computes integer quotient ⌊m ÷ n⌋ on #I^m#I^n#, outputting # (0) when m < n or n = 0.',
    algorithmSummary:
      'Marks operand separators S and T, then repeatedly subtracts n tallies from m (using X/Y markers) and appends one quotient I after T per completed round. When m < n remains, erases m, n, S, T and parks at #I^⌊m/n⌋[#].',
    inputFormat: '#I^m#I^n# (e.g., #IIIIII#II# → #III#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', 'X', 'Y', 'S', 'T'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 180, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Unary Integer Division (⌊m ÷ n⌋) — L&P Schema',
      width: 760,
      height: 400,
      nodes: [
        { id: 'n_start', label: '> L', kind: 'start-action', x: 95, y: 130 },
        { id: 'n_init', label: 'S, T', kind: 'write', x: 275, y: 130 },
        { id: 'n_sub', label: 'Y ↔ X', kind: 'write', x: 470, y: 130 },
        { id: 'n_incQ', label: 'I R_#', kind: 'write', x: 665, y: 130 },
        { id: 'n_zero', label: 'E', kind: 'builtin', builtinId: 'E', x: 95, y: 265 },
        { id: 'n_clean', label: '# R_#', kind: 'builtin', builtinId: 'R_hash', x: 470, y: 265 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^⌊m÷n⌋#', kind: 'halt', x: 280, y: 350 },
      ],
      edges: [
        { id: 'e_1', from: 'n_start', to: 'n_init', label: 'I' },
        { id: 'e_2', from: 'n_start', to: 'n_zero', label: '#' },
        { id: 'e_3', from: 'n_init', to: 'n_zero', label: 'm = 0' },
        { id: 'e_4', from: 'n_init', to: 'n_sub', label: 'T' },
        { id: 'e_5', from: 'n_sub', to: 'n_incQ', label: 'S' },
        { id: 'e_6', from: 'n_incQ', to: 'n_sub', label: 'T', curveOffset: -64 },
        { id: 'e_7', from: 'n_sub', to: 'n_clean', label: '#' },
        { id: 'e_8', from: 'n_clean', to: 'n_halt', label: '#' },
        { id: 'e_9', from: 'n_zero', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '3 ÷ 2 = 1', input: '#III#II#', expectedOutput: '#I#' },
      { label: '6 ÷ 2 = 3', input: '#IIIIII#II#', expectedOutput: '#III#' },
      { label: '2 ÷ 3 = 0', input: '#II#III#', expectedOutput: '#' },
      { label: '3 ÷ 0 = 0', input: '#III##', expectedOutput: '#' },
      { label: '0 ÷ 2 = 0', input: '##II#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildModulo(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_start' },
    { id: 'q_chkN', label: 'n = 0?', x: 0, y: 0, schemaNodeId: 'n_start' },
    { id: 'q_wipeM', label: 'Wipe m', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_skipN_init', label: 'Mark S', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_chkM_init', label: 'm = 0?', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_wipeN_only', label: 'Wipe n', x: 0, y: 0, schemaNodeId: 'n_zero' },
    { id: 'q_toEnd_init', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_pickN', label: 'Pick n ←', x: 0, y: 0, schemaNodeId: 'n_trySub' },
    { id: 'q_toS', label: 'To S ←', x: 0, y: 0, schemaNodeId: 'n_trySub' },
    { id: 'q_findM', label: 'Try m ←', x: 0, y: 0, schemaNodeId: 'n_trySub' },
    { id: 'q_backEnd', label: 'Back →', x: 0, y: 0, schemaNodeId: 'n_trySub' },
    { id: 'q_commitZ', label: 'Commit Z→X', x: 0, y: 0, schemaNodeId: 'n_commit' },
    { id: 'q_restY', label: 'Restore n →', x: 0, y: 0, schemaNodeId: 'n_commit' },
    { id: 'q_restoreZ_wipe', label: 'Restore Z→I', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_wipe_afterW', label: 'Wipe tail →', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'q_backToW', label: 'Park at W ←', x: 0, y: 0, schemaNodeId: 'n_clean' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' },
  ];

  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`md${rid++}`, from, read, to, write, move));
  };

  add('q0', '#', 'q_chkN', '#', 'L');

  // If n = 0 -> erase m and halt at #
  add('q_chkN', '#', 'q_wipeM', '#', 'L');
  add('q_chkN', 'I', 'q_skipN_init', 'I', 'L');
  add('q_wipeM', 'I', 'q_wipeM', '#', 'L');
  add('q_wipeM', '#', 'qH', '#', 'R');

  add('q_skipN_init', 'I', 'q_skipN_init', 'I', 'L');
  add('q_skipN_init', '#', 'q_chkM_init', 'S', 'L');

  add('q_chkM_init', '#', 'q_wipeN_only', '#', 'R');
  add('q_chkM_init', 'I', 'q_toEnd_init', 'I', 'R');
  add('q_wipeN_only', 'S', 'q_wipeN_only', '#', 'R');
  add('q_wipeN_only', 'I', 'q_wipeN_only', '#', 'R');
  add('q_wipeN_only', '#', 'qH', '#', 'S');

  add('q_toEnd_init', 'I', 'q_toEnd_init', 'I', 'R');
  add('q_toEnd_init', 'S', 'q_toEnd_init', 'S', 'R');
  add('q_toEnd_init', '#', 'q_pickN', '#', 'L');

  // Pick next I of n
  add('q_pickN', 'Y', 'q_pickN', 'Y', 'L');
  add('q_pickN', 'I', 'q_toS', 'Y', 'L');
  add('q_pickN', 'S', 'q_commitZ', 'S', 'L');

  add('q_toS', 'I', 'q_toS', 'I', 'L');
  add('q_toS', 'S', 'q_findM', 'S', 'L');

  add('q_findM', 'X', 'q_findM', 'X', 'L');
  add('q_findM', 'Z', 'q_findM', 'Z', 'L');
  add('q_findM', 'I', 'q_backEnd', 'Z', 'R');
  add('q_findM', '#', 'q_restoreZ_wipe', '#', 'R');

  for (const s of ['Z', 'X', 'S', 'I', 'Y']) {
    add('q_backEnd', s, 'q_backEnd', s, 'R');
  }
  add('q_backEnd', '#', 'q_pickN', '#', 'L');

  // Full subtraction succeeded: commit tentative Z -> X, restore Y -> I
  add('q_commitZ', 'X', 'q_commitZ', 'X', 'L');
  add('q_commitZ', 'Z', 'q_commitZ', 'X', 'L');
  add('q_commitZ', 'I', 'q_restY', 'I', 'R');
  add('q_commitZ', '#', 'q_restY', '#', 'R');

  add('q_restY', 'X', 'q_restY', 'X', 'R');
  add('q_restY', 'S', 'q_restY', 'S', 'R');
  add('q_restY', 'Y', 'q_restY', 'I', 'R');
  add('q_restY', '#', 'q_pickN', '#', 'L');

  // Tentative round failed (m_rem < n): restore Z -> I, mark end of remainder with W, wipe rightwards, park at W->#
  add('q_restoreZ_wipe', 'I', 'q_restoreZ_wipe', 'I', 'R');
  add('q_restoreZ_wipe', 'Z', 'q_restoreZ_wipe', 'I', 'R');
  add('q_restoreZ_wipe', 'X', 'q_wipe_afterW', 'W', 'R');
  add('q_restoreZ_wipe', 'S', 'q_wipe_afterW', 'W', 'R');

  for (const s of ['X', 'S', 'I', 'Y']) {
    add('q_wipe_afterW', s, 'q_wipe_afterW', '#', 'R');
  }
  add('q_wipe_afterW', '#', 'q_backToW', '#', 'L');

  add('q_backToW', '#', 'q_backToW', '#', 'L');
  add('q_backToW', 'W', 'qH', '#', 'S');

  return {
    id: `compiled-unary-mod-${Date.now().toString(36)}`,
    name: 'Unary Modulo (m mod n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Computes the remainder m mod n on #I^m#I^n#, outputting # when n divides m or n = 0.',
    algorithmSummary:
      'Commits full subtractions of n using X and tests the next round tentatively using Z. When remaining m < n, restores Z → I, marks the boundary with W, wipes S and n, and parks at the # immediately after the remainder.',
    inputFormat: '#I^m#I^n# (e.g., #IIIII#II# → #I#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', 'X', 'Y', 'Z', 'S', 'W'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 180, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Unary Modulo (m mod n) — L&P Schema',
      width: 770,
      height: 400,
      nodes: [
        { id: 'n_start', label: '> L', kind: 'start-action', x: 95, y: 130 },
        { id: 'n_init', label: 'S R_#', kind: 'builtin', builtinId: 'R_hash', x: 275, y: 130 },
        { id: 'n_trySub', label: 'Y ↔ Z', kind: 'write', x: 475, y: 130 },
        { id: 'n_commit', label: 'Z→X Y→I', kind: 'write', x: 675, y: 130 },
        { id: 'n_zero', label: 'E', kind: 'builtin', builtinId: 'E', x: 95, y: 265 },
        { id: 'n_clean', label: 'Z→I E', kind: 'builtin', builtinId: 'E', x: 475, y: 265 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(m mod n)#', kind: 'halt', x: 285, y: 350 },
      ],
      edges: [
        { id: 'e_1', from: 'n_start', to: 'n_init', label: 'I' },
        { id: 'e_2', from: 'n_start', to: 'n_zero', label: '#' },
        { id: 'e_3', from: 'n_init', to: 'n_zero', label: 'm = 0' },
        { id: 'e_4', from: 'n_init', to: 'n_trySub', label: '#' },
        { id: 'e_5', from: 'n_trySub', to: 'n_commit', label: 'S' },
        { id: 'e_6', from: 'n_commit', to: 'n_trySub', label: '#', curveOffset: -64 },
        { id: 'e_7', from: 'n_trySub', to: 'n_clean', label: '#' },
        { id: 'e_8', from: 'n_clean', to: 'n_halt', label: 'W' },
        { id: 'e_9', from: 'n_zero', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '5 mod 2 = 1', input: '#IIIII#II#', expectedOutput: '#I#' },
      { label: '4 mod 2 = 0', input: '#IIII#II#', expectedOutput: '#' },
      { label: '2 mod 3 = 2', input: '#II#III#', expectedOutput: '#II#' },
      { label: '3 mod 0 = 0', input: '#III##', expectedOutput: '#' },
      { label: '0 mod 2 = 0', input: '##II#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildScale(k: number): TuringMachineDefinition {
  if (k === 1) {
    const states: StateNode[] = [
      { id: 'q0', label: 'Start', x: 140, y: 120, isStart: true, schemaNodeId: 'n_id' },
      { id: 'qH', label: 'Halt', x: 340, y: 120, isHalt: true, schemaNodeId: 'n_halt' },
    ];
    const transitions = [makeRule('sc0', 'q0', '#', 'qH', '#', 'S')];
    return {
      id: `compiled-unary-scale-1-${Date.now().toString(36)}`,
      name: 'Unary Scale (1 × n)',
      category: 'unary-arithmetic',
      kind: 'transducer',
      description: 'Identity scaling 1 × n on #I^n#.',
      algorithmSummary: 'Leaves #I^n[#] unchanged and halts immediately on the trailing #.',
      inputFormat: '#I^n# (e.g., #III# → #III#)',
      blankSymbol: '#',
      inputAlphabet: ['I'],
      tapeAlphabet: ['#', 'I'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH'],
      states,
      transitions,
      schemaDiagram: {
        title: 'Unary Scale (k = 1)',
        width: 460,
        height: 200,
        nodes: [
          { id: 'n_id', label: '> I^n', kind: 'start-action', x: 140, y: 100 },
          { id: 'n_halt', label: 'Halt', sublabel: '#I^n#', kind: 'halt', x: 320, y: 100 },
        ],
        edges: [{ id: 'e_0', from: 'n_id', to: 'n_halt', label: '#' }],
      },
      sampleInputs: [
        { label: '1 × 3 = 3', input: '#III#', expectedOutput: '#III#' },
        { label: '1 × 0 = 0', input: '#', expectedOutput: '#' },
      ],
      isCustom: true,
    };
  }

  const mc = new MacroCompiler(['I']);
  const cCount = k - 1;
  const blocks: Array<{ entry: string; connect: (syms: string[], target: string, move?: 'L' | 'R' | 'S') => void; isCopy: boolean }> = [];
  const schemaNodes: SchemaNode[] = [];
  const schemaEdges: SchemaEdge[] = [];

  for (let i = 0; i < cCount; i += 1) {
    const nid = `n_C_${i}`;
    const blk = mc.createCopy(nid, [`C_${i + 1}`]);
    blocks.push({ ...blk, isCopy: true });
    schemaNodes.push({
      id: nid,
      label: i === 0 ? '> C' : 'C',
      sublabel: i === 0 ? '#w#w#' : 'Append #w',
      kind: i === 0 ? 'start-action' : 'builtin',
      builtinId: 'C',
      x: 105 + i * 165,
      y: 115,
    });
  }

  for (let i = 0; i < cCount; i += 1) {
    const nid = `n_SL_${i}`;
    const blk = mc.createShiftLeft(nid, [`S_L_${i + 1}`]);
    blocks.push({ ...blk, isCopy: false });
    schemaNodes.push({
      id: nid,
      label: 'S_L',
      sublabel: 'Merge #',
      kind: 'builtin',
      builtinId: 'S_L',
      x: 105 + (cCount + i) * 165,
      y: 115,
    });
  }

  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  schemaNodes.push({
    id: 'n_halt',
    label: 'Halt',
    sublabel: `#I^(${k}n)#`,
    kind: 'halt',
    x: 105 + 2 * cCount * 165,
    y: 115,
  });

  for (let i = 0; i < blocks.length; i += 1) {
    const target = i + 1 < blocks.length ? blocks[i + 1].entry : halt;
    blocks[i].connect(blocks[i].isCopy ? ['#'] : mc.fullAlphabet, target, 'S');
    const fromId = schemaNodes[i].id;
    const toId = schemaNodes[i + 1].id;
    schemaEdges.push({ id: `e_${i}`, from: fromId, to: toId, label: '#' });
  }

  const compiled = mc.finalize(blocks[0].entry, [halt], { colGap: 155, rowGap: 100 });
  const schemaDiagram: SchemaDiagram = {
    title: `Unary Scale (${k}n) = > ${Array(cCount).fill('C').join(' → ')} → ${Array(cCount).fill('S_L').join(' → ')}`,
    width: Math.max(540, 140 + schemaNodes.length * 165),
    height: 220,
    nodes: schemaNodes,
    edges: schemaEdges,
  };

  return {
    id: `compiled-unary-scale-${k}-${Date.now().toString(36)}`,
    name: `Unary Scale (${k}n)`,
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: `Scales a unary tally #I^n# → #I^(${k}n)# by composing ${cCount} Copy (C) blocks and ${cCount} Shift Left (S_L) blocks.`,
    algorithmSummary: `Runs C ${cCount} time(s) to produce ${k} separated copies #I^n#...#I^n#, then executes S_L ${cCount} time(s) to merge all delimiters into #I^(${k}n)[#].`,
    inputFormat: `#I^n# (e.g., #II# → #${'I'.repeat(2 * k)}#)`,
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram,
    sampleInputs: [
      { label: `${k} × 2 = ${2 * k}`, input: '#II#', expectedOutput: `#${'I'.repeat(2 * k)}#` },
      { label: `${k} × 1 = ${k}`, input: '#I#', expectedOutput: `#${'I'.repeat(k)}#` },
      { label: `${k} × 0 = 0`, input: '#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildAddConst(k: number): TuringMachineDefinition {
  const mc = new MacroCompiler(['I']);
  const schemaNodes: SchemaNode[] = [];
  const schemaEdges: SchemaEdge[] = [];
  const blocks: Array<{ entry: string; connect: (syms: string[], target: string, move?: 'L' | 'R' | 'S') => void }> = [];

  for (let i = 0; i < k; i += 1) {
    const wId = `n_w_${i}`;
    const rId = `n_r_${i}`;
    const wBlk = mc.createWrite('I', wId, [`write I (${i + 1}/${k})`]);
    const rBlk = mc.createMove('R', rId, [`R (${i + 1}/${k})`]);
    wBlk.connect(mc.fullAlphabet, rBlk.entry, 'S');
    blocks.push({ entry: wBlk.entry, connect: rBlk.connect });

    schemaNodes.push({
      id: wId,
      label: i === 0 ? '> I' : 'I',
      kind: i === 0 ? 'start-action' : 'write',
      x: 95 + i * 290,
      y: 115,
    });
    schemaNodes.push({
      id: rId,
      label: 'R',
      kind: 'move',
      x: 240 + i * 290,
      y: 115,
    });
    schemaEdges.push({ id: `e_wr_${i}`, from: wId, to: rId });
    if (i > 0) {
      schemaEdges.push({ id: `e_step_${i}`, from: `n_r_${i - 1}`, to: wId });
    }
  }

  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  for (let i = 0; i < blocks.length; i += 1) {
    const target = i + 1 < blocks.length ? blocks[i + 1].entry : halt;
    blocks[i].connect(mc.fullAlphabet, target, 'S');
  }

  schemaNodes.push({
    id: 'n_halt',
    label: 'Halt',
    sublabel: `#I^(n+${k})#`,
    kind: 'halt',
    x: 95 + k * 290,
    y: 115,
  });
  schemaEdges.push({ id: 'e_end', from: `n_r_${k - 1}`, to: 'n_halt', label: '#' });

  const compiled = mc.finalize(blocks[0].entry, [halt], { colGap: 155, rowGap: 100 });
  return {
    id: `compiled-unary-addconst-${k}-${Date.now().toString(36)}`,
    name: `Unary + ${k} (n + ${k})`,
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: `Adds constant ${k} to a unary tally #I^n# → #I^(n+${k})#.`,
    algorithmSummary: `Starting at the trailing #, executes (write I → R) ${k} time(s) to append ${k} tallies and park on the new trailing #.`,
    inputFormat: `#I^n# (e.g., #II# → #${'I'.repeat(2 + k)}#)`,
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: `Unary + ${k} = > ${(Array(k).fill('I → R')).join(' → ')}`,
      width: Math.max(540, 120 + (2 * k + 1) * 145),
      height: 210,
      nodes: schemaNodes,
      edges: schemaEdges,
    },
    sampleInputs: [
      { label: `2 + ${k} = ${2 + k}`, input: '#II#', expectedOutput: `#${'I'.repeat(2 + k)}#` },
      { label: `0 + ${k} = ${k}`, input: '#', expectedOutput: `#${'I'.repeat(k)}#` },
    ],
    isCustom: true,
  };
}

function buildSubConst(k: number): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_start' },
  ];
  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`sc${rid++}`, from, read, to, write, move));
  };

  for (let i = 0; i < k; i += 1) {
    states.push({ id: `q_sub_${i}`, label: `Erase ${i + 1}/${k}`, x: 0, y: 0, schemaNodeId: `n_sub_${i}` });
  }
  states.push({ id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' });

  add('q0', '#', 'q_sub_0', '#', 'L');
  for (let i = 0; i < k; i += 1) {
    const cur = `q_sub_${i}`;
    if (i + 1 < k) {
      add(cur, 'I', `q_sub_${i + 1}`, '#', 'L');
    } else {
      add(cur, 'I', 'qH', '#', 'S');
    }
    add(cur, '#', 'qH', '#', 'R');
  }

  const schemaNodes: SchemaNode[] = [
    { id: 'n_start', label: '> L', kind: 'start-action', x: 95, y: 120 },
  ];
  const schemaEdges: SchemaEdge[] = [
    { id: 'e_s', from: 'n_start', to: 'n_sub_0', label: '#' },
  ];
  for (let i = 0; i < k; i += 1) {
    const nid = `n_sub_${i}`;
    schemaNodes.push({
      id: nid,
      label: i + 1 < k ? '# L' : '#',
      kind: 'write',
      x: 255 + i * 160,
      y: 120,
    });
    if (i + 1 < k) {
      schemaEdges.push({ id: `e_i_${i}`, from: nid, to: `n_sub_${i + 1}`, label: 'I' });
      schemaEdges.push({ id: `e_h_${i}`, from: nid, to: 'n_halt', label: '# R' });
    } else {
      schemaEdges.push({ id: `e_end`, from: nid, to: 'n_halt', label: 'I, #' });
    }
  }
  const haltX = Math.round(95 + (k * 160) / 2);
  schemaNodes.push({
    id: 'n_halt',
    label: 'Halt',
    sublabel: `max(0, n−${k})`,
    kind: 'halt',
    x: Math.max(255, haltX),
    y: 255,
  });

  return {
    id: `compiled-unary-subconst-${k}-${Date.now().toString(36)}`,
    name: `Unary ∸ ${k} (max(0, n − ${k}))`,
    category: 'unary-arithmetic',
    kind: 'transducer',
    description: `Subtracts constant ${k} from a unary tally #I^n#, clamping at 0 (#).`,
    algorithmSummary: `Steps left up to ${k} times erasing each I to #. If the leading # is reached early (n < ${k}), steps right once to park at #; on the ${k}-th erased I, halts in place on the newly created trailing #.`,
    inputFormat: `#I^n# (e.g., #${'I'.repeat(k + 2)}# → #II#)`,
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(states, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: `Unary ∸ ${k} — L&P Schema`,
      width: Math.max(480, 180 + (k + 1) * 160),
      height: 325,
      nodes: schemaNodes,
      edges: schemaEdges,
    },
    sampleInputs: [
      { label: `${k + 2} ∸ ${k} = 2`, input: `#${'I'.repeat(k + 2)}#`, expectedOutput: '#II#' },
      { label: `${k} ∸ ${k} = 0`, input: `#${'I'.repeat(k)}#`, expectedOutput: '#' },
      { label: `1 ∸ ${k} = ${Math.max(0, 1 - k)}`, input: '#I#', expectedOutput: 1 > k ? `#${'I'.repeat(1 - k)}#` : '#' },
      { label: `0 ∸ ${k} = 0`, input: '#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

export function compileUnaryArithmeticToTm(spec: UnaryArithmeticSpec): CompileResult {
  const k = clampK(spec.constantK);
  switch (spec.op) {
    case 'monus':
      return { ok: true, machine: buildMonus() };
    case 'add':
      return { ok: true, machine: buildAdd() };
    case 'multiply':
      return { ok: true, machine: buildMultiply() };
    case 'divide':
      return { ok: true, machine: buildDivide() };
    case 'modulo':
      return { ok: true, machine: buildModulo() };
    case 'scale':
      return { ok: true, machine: buildScale(k) };
    case 'add-const':
      return { ok: true, machine: buildAddConst(k) };
    case 'sub-const':
      return { ok: true, machine: buildSubConst(k) };
  }
}
