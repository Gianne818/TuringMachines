import { MacroCompiler } from '../engine/macroCompiler';
import type { StateNode, TransitionRule, TuringMachineDefinition } from '../engine/types';

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

function buildMonus(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 95, y: 170, isStart: true },
    { id: 'q1', label: 'Check n', x: 255, y: 170 },
    { id: 'q2', label: 'Skip n ←', x: 425, y: 110 },
    { id: 'q3', label: 'Check m', x: 595, y: 110 },
    { id: 'q4', label: 'Rewind m', x: 765, y: 70 },
    { id: 'q5', label: 'Erase m[0]', x: 765, y: 195 },
    { id: 'q6', label: 'Return →', x: 595, y: 245 },
    { id: 'q7', label: 'Skip n →', x: 425, y: 245 },
    { id: 'q8', label: 'To n (m=0)', x: 595, y: 345 },
    { id: 'q9', label: 'Wipe n', x: 765, y: 345 },
    { id: 'qH', label: 'Halt', x: 255, y: 325, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    // Step from trailing # into rightmost cell of n
    makeRule('m1', 'q0', '#', 'q1', '#', 'L'),

    // q1: inspect rightmost cell of n
    makeRule('m2', 'q1', 'I', 'q2', '#', 'L'),
    makeRule('m3', 'q1', '#', 'qH', '#', 'S'),

    // q2: skip remaining I's of n leftwards until separator #
    makeRule('m4', 'q2', 'I', 'q2', 'I', 'L'),
    makeRule('m5', 'q2', '#', 'q3', '#', 'L'),

    // q3: check whether m still has tallies
    makeRule('m6', 'q3', 'I', 'q4', 'I', 'L'),
    makeRule('m7', 'q3', '#', 'q8', '#', 'R'),

    // q4: rewind left across m to leading #, then step R to leftmost I of m
    makeRule('m8', 'q4', 'I', 'q4', 'I', 'L'),
    makeRule('m9', 'q4', '#', 'q5', '#', 'R'),

    // q5: erase leftmost I of m, move R back towards separator
    makeRule('m10', 'q5', 'I', 'q6', '#', 'R'),

    // q6: walk right across remaining m until separator #
    makeRule('m11', 'q6', 'I', 'q6', 'I', 'R'),
    makeRule('m12', 'q6', '#', 'q7', '#', 'R'),

    // q7: walk right across remaining n until trailing #, return to q0
    makeRule('m13', 'q7', 'I', 'q7', 'I', 'R'),
    makeRule('m14', 'q7', '#', 'q0', '#', 'S'),

    // q8 -> q9: when m reaches 0 while n had an I erased, wipe remaining n rightwards and halt on #
    makeRule('m15', 'q8', '#', 'q9', '#', 'R'),
    makeRule('m16', 'q9', 'I', 'q9', '#', 'R'),
    makeRule('m17', 'q9', '#', 'qH', '#', 'S'),
  ];

  return {
    id: 'unary-monus',
    name: 'Unary Monus (m ∸ n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Computes proper subtraction max(0, m − n) using unary tally representation I separated by #.',
    algorithmSummary:
      'Repeatedly cancels the rightmost I of n against the leftmost I of m. If n reaches 0 first, the remaining I tallies of m sit flush against the separator # with the head parked immediately after them. If m reaches 0 first, all remaining tallies of n are erased to #.',
    inputFormat: '#I^m#I^n# (e.g., #III#II# for 3 ∸ 2)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '3 ∸ 2 = 1', input: '#III#II#', expectedOutput: '#I#' },
      { label: '5 ∸ 2 = 3', input: '#IIIII#II#', expectedOutput: '#III#' },
      { label: '2 ∸ 3 = 0', input: '#II#III#', expectedOutput: '#' },
      { label: '3 ∸ 3 = 0', input: '#III#III#', expectedOutput: '#' },
      { label: '3 ∸ 0 = 3', input: '#III##', expectedOutput: '#III#' },
      { label: '0 ∸ 2 = 0', input: '##II#', expectedOutput: '#' },
    ],
  };
}

function buildAddition(): TuringMachineDefinition {
  const mc = new MacroCompiler(['I']);
  const sl = mc.createShiftLeft('n_SL', ['S_L']);
  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  sl.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(sl.entry, [halt], { colGap: 165, rowGap: 110 });

  return {
    id: 'unary-addition',
    name: 'Unary Addition (m + n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Computes m + n in unary notation by shifting the second tally block one cell left over the # delimiter via Shift Left (S_L).',
    algorithmSummary:
      'Directly invokes the built-in Shift Left (S_L) machine on #I^m#I^n[#]: scans left to the separator #, shifts all n tallies one cell left to join m, erases the duplicate trailing I to #, and parks at #I^(m+n)[#].',
    inputFormat: '#I^m#I^n# (e.g., #III#II# for 3 + 2)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Unary Addition = Shift Left (> S_L)',
      width: 480,
      height: 220,
      nodes: [
        { id: 'n_SL', label: '> S_L', sublabel: 'Click to view S_L', kind: 'builtin', builtinId: 'S_L', x: 170, y: 115 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(m+n)#', kind: 'halt', x: 345, y: 115 },
      ],
      edges: [{ id: 'e_add', from: 'n_SL', to: 'n_halt', label: '#' }],
    },
    sampleInputs: [
      { label: '3 + 2 = 5', input: '#III#II#', expectedOutput: '#IIIII#' },
      { label: '3 + 0 = 3', input: '#III##', expectedOutput: '#III#' },
      { label: '0 + 2 = 2', input: '##II#', expectedOutput: '#II#' },
      { label: '0 + 0 = 0', input: '###', expectedOutput: '#' },
    ],
  };
}

function buildMultiplication(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 190, isStart: true },
    { id: 'q_chkN', label: 'Check n', x: 230, y: 190 },
    { id: 'q_wipeM', label: 'n=0 Wipe', x: 230, y: 345 },
    { id: 'q_seekSep', label: 'Seek sep', x: 380, y: 120 },
    { id: 'q_chkM', label: 'Check m', x: 540, y: 120 },
    { id: 'q_skipToN0', label: 'm=0 Sep', x: 540, y: 255 },
    { id: 'q_wipeN0', label: 'm=0 Wipe', x: 540, y: 375 },
    { id: 'q_rewM', label: 'Rewind m', x: 705, y: 120 },
    { id: 'q_loopM', label: 'Loop m', x: 870, y: 120 },
    { id: 'q_goN', label: 'To n →', x: 1040, y: 65 },
    { id: 'q_copyN', label: 'Copy n', x: 1205, y: 65 },
    { id: 'q_addP', label: 'Append I', x: 1370, y: 65 },
    { id: 'q_backY', label: 'Back Y', x: 1205, y: 175 },
    { id: 'q_restY', label: 'Restore n', x: 1040, y: 175 },
    { id: 'q_backX', label: 'Back X', x: 870, y: 235 },
    { id: 'q_wipeX', label: 'Wipe X', x: 870, y: 335 },
    { id: 'q_skipToN', label: 'To n', x: 1040, y: 335 },
    { id: 'q_wipeN', label: 'Wipe n', x: 1205, y: 335 },
    { id: 'q_scanP', label: 'To End →', x: 1370, y: 335 },
    { id: 'qH', label: 'Halt', x: 1370, y: 215, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('mu1', 'q0', '#', 'q_chkN', '#', 'L'),
    // Check n
    makeRule('mu2', 'q_chkN', '#', 'q_wipeM', '#', 'L'),
    makeRule('mu3', 'q_chkN', 'I', 'q_seekSep', 'I', 'L'),

    // n = 0 -> erase m and halt
    makeRule('mu4', 'q_wipeM', 'I', 'q_wipeM', '#', 'L'),
    makeRule('mu5', 'q_wipeM', '#', 'qH', '#', 'R'),

    // Seek separator between m and n
    makeRule('mu6', 'q_seekSep', 'I', 'q_seekSep', 'I', 'L'),
    makeRule('mu7', 'q_seekSep', '#', 'q_chkM', '#', 'L'),

    // Check m
    makeRule('mu8', 'q_chkM', '#', 'q_skipToN0', '#', 'R'),
    makeRule('mu9', 'q_chkM', 'I', 'q_rewM', 'I', 'L'),

    // m = 0 -> erase n and halt
    makeRule('mu10', 'q_skipToN0', '#', 'q_wipeN0', '#', 'R'),
    makeRule('mu11', 'q_wipeN0', 'I', 'q_wipeN0', '#', 'R'),
    makeRule('mu12', 'q_wipeN0', '#', 'qH', '#', 'S'),

    // Rewind to start of m
    makeRule('mu13', 'q_rewM', 'I', 'q_rewM', 'I', 'L'),
    makeRule('mu14', 'q_rewM', '#', 'q_loopM', '#', 'R'),

    // Main loop over each I of m
    makeRule('mu15', 'q_loopM', 'I', 'q_goN', 'X', 'R'),
    makeRule('mu16', 'q_loopM', '#', 'q_wipeX', '#', 'L'),

    // Walk right to n
    makeRule('mu17', 'q_goN', 'I', 'q_goN', 'I', 'R'),
    makeRule('mu18', 'q_goN', '#', 'q_copyN', '#', 'R'),

    // Copy each I of n to product region after #
    makeRule('mu19', 'q_copyN', 'Y', 'q_copyN', 'Y', 'R'),
    makeRule('mu20', 'q_copyN', 'I', 'q_addP', 'Y', 'R'),
    makeRule('mu21', 'q_copyN', '#', 'q_restY', '#', 'L'),

    // Walk right past n, sep #, and product I's to append I
    makeRule('mu22', 'q_addP', 'I', 'q_addP', 'I', 'R'),
    makeRule('mu23', 'q_addP', '#', 'q_addP_sep', '#', 'R'),

    // Return back from product to Y
    makeRule('mu24', 'q_backY', 'I', 'q_backY', 'I', 'L'),
    makeRule('mu25', 'q_backY', '#', 'q_backY_n', '#', 'L'),

    // Restore Y -> I in n
    makeRule('mu26', 'q_restY', 'Y', 'q_restY', 'I', 'L'),
    makeRule('mu27', 'q_restY', '#', 'q_backX', '#', 'L'),

    // Walk left across m back to X
    makeRule('mu28', 'q_backX', 'I', 'q_backX', 'I', 'L'),
    makeRule('mu29', 'q_backX', 'X', 'q_loopM', 'X', 'R'),

    // Final cleanup: wipe X's in m, wipe I's in n, scan past product to trailing #
    makeRule('mu30', 'q_wipeX', 'X', 'q_wipeX', '#', 'L'),
    makeRule('mu31', 'q_wipeX', '#', 'q_skipToN', '#', 'R'),
    makeRule('mu32', 'q_skipToN', '#', 'q_skipToN', '#', 'R'),
    makeRule('mu33', 'q_skipToN', 'I', 'q_wipeN', '#', 'R'),
    makeRule('mu34', 'q_wipeN', 'I', 'q_wipeN', '#', 'R'),
    makeRule('mu35', 'q_wipeN', '#', 'q_scanP', '#', 'R'),
    makeRule('mu36', 'q_scanP', 'I', 'q_scanP', 'I', 'R'),
    makeRule('mu37', 'q_scanP', '#', 'qH', '#', 'S'),
  ];

  // Add the 2 helper states for crossing the n|product separator #
  states.push(
    { id: 'q_addP_sep', label: 'In prod', x: 1370, y: 120 },
    { id: 'q_backY_n', label: 'Back n', x: 1370, y: 175 },
  );
  transitions.push(
    makeRule('mu38', 'q_addP_sep', 'I', 'q_addP_sep', 'I', 'R'),
    makeRule('mu39', 'q_addP_sep', '#', 'q_backY', 'I', 'L'),
    makeRule('mu40', 'q_backY_n', 'I', 'q_backY_n', 'I', 'L'),
    makeRule('mu41', 'q_backY_n', 'Y', 'q_copyN', 'Y', 'R'),
  );

  return {
    id: 'unary-multiply',
    name: 'Unary Multiplication (m × n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Computes m × n in unary notation by appending n tallies for each tally of m, then cleaning all operands.',
    algorithmSummary:
      'Handles m=0 or n=0 immediately by erasing to #. Otherwise marks each I of m with X, copies I^n to a third block on the right using marker Y, restores n, and repeats. Once all m tallies are processed, wipes X and n and parks on the trailing # after I^(m×n).',
    inputFormat: '#I^m#I^n# (e.g., #III#II# for 3 × 2)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', 'X', 'Y'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '3 × 2 = 6', input: '#III#II#', expectedOutput: '#IIIIII#' },
      { label: '2 × 2 = 4', input: '#II#II#', expectedOutput: '#IIII#' },
      { label: '1 × 1 = 1', input: '#I#I#', expectedOutput: '#I#' },
      { label: '3 × 0 = 0', input: '#III##', expectedOutput: '#' },
      { label: '0 × 2 = 0', input: '##II#', expectedOutput: '#' },
    ],
  };
}

function buildDoubler(): TuringMachineDefinition {
  const mc = new MacroCompiler(['I']);
  const copy = mc.createCopy('n_C', ['C']);
  const sl = mc.createShiftLeft('n_SL', ['S_L']);
  const halt = mc.newState('Halt', 'n_halt', ['Halt']);

  copy.connect(['#'], sl.entry, 'S');
  sl.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(copy.entry, [halt], { colGap: 155, rowGap: 105 });

  return {
    id: 'unary-doubler',
    name: 'Unary Doubler (2n)',
    category: 'unary-arithmetic',
    kind: 'transducer',
    description:
      'Doubles a unary tally #I^n# → #I^(2n)# by composing Copy (C) followed by Shift Left (S_L).',
    algorithmSummary:
      'Demonstrates Lewis & Papadimitriou machine composition: first Copy (C) maps #I^n# to #I^n#I^n#, then Shift Left (S_L) merges the two halves into #I^(2n)# with the head at trailing #.',
    inputFormat: '#I^n# (e.g., #III# → #IIIIII#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Unary Doubler = > C → S_L',
      width: 560,
      height: 220,
      nodes: [
        { id: 'n_C', label: '> C', sublabel: '#w#w#', kind: 'builtin', builtinId: 'C', x: 135, y: 115 },
        { id: 'n_SL', label: 'S_L', sublabel: 'Merge #', kind: 'builtin', builtinId: 'S_L', x: 300, y: 115 },
        { id: 'n_halt', label: 'Halt', sublabel: '#I^(2n)#', kind: 'halt', x: 455, y: 115 },
      ],
      edges: [
        { id: 'e_1', from: 'n_C', to: 'n_SL', label: '#' },
        { id: 'e_2', from: 'n_SL', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '2 × 3 = 6', input: '#III#', expectedOutput: '#IIIIII#' },
      { label: '2 × 1 = 2', input: '#I#', expectedOutput: '#II#' },
      { label: '2 × 0 = 0', input: '#', expectedOutput: '#' },
    ],
  };
}

export const UNARY_ARITHMETIC_TEMPLATES: TuringMachineDefinition[] = [
  buildMonus(),
  buildAddition(),
  buildMultiplication(),
  buildDoubler(),
];
