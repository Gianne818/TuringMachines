import { autoLayoutStates } from '../engine/layout';
import type {
  SampleInput,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import type { BinaryLogicOp, BinaryLogicSpec, CompileResult } from './types';

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

type TwoInputOp = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR' | 'IMPLIES' | 'CUSTOM';

const GATE_META: Record<
  TwoInputOp,
  { name: string; symbol: string; table: [0 | 1, 0 | 1, 0 | 1, 0 | 1] }
> = {
  AND: { name: 'Binary Bitwise AND (A ∧ B)', symbol: '∧', table: [0, 0, 0, 1] },
  OR: { name: 'Binary Bitwise OR (A ∨ B)', symbol: '∨', table: [0, 1, 1, 1] },
  XOR: { name: 'Binary Bitwise XOR (A ⊕ B)', symbol: '⊕', table: [0, 1, 1, 0] },
  NAND: { name: 'Binary Bitwise NAND (¬(A ∧ B))', symbol: '⊼', table: [1, 1, 1, 0] },
  NOR: { name: 'Binary Bitwise NOR (¬(A ∨ B))', symbol: '⊽', table: [1, 0, 0, 0] },
  XNOR: { name: 'Binary Bitwise XNOR (A ↔ B)', symbol: '⊙', table: [1, 0, 0, 1] },
  IMPLIES: { name: 'Binary Bitwise IMPLIES (A → B)', symbol: '→', table: [1, 1, 0, 1] },
  CUSTOM: { name: 'Custom 2-Input Bitwise Gate', symbol: '★', table: [0, 0, 0, 1] },
};

function evalGateWord(
  a: string,
  b: string,
  table: [0 | 1, 0 | 1, 0 | 1, 0 | 1],
): string {
  const len = Math.max(a.length, b.length);
  if (len === 0) return '';
  const pa = a.padStart(len, '0');
  const pb = b.padStart(len, '0');
  let out = '';
  for (let i = 0; i < len; i += 1) {
    const ba = pa[i] === '1' ? 1 : 0;
    const bb = pb[i] === '1' ? 1 : 0;
    out += String(table[ba * 2 + bb]);
  }
  return out;
}

function buildCarrySchemaBranch(opts: {
  prefix: 'c0' | 'c1';
  seekY: number;
  writeTopY: number;
  writeBotY: number;
  loopAngleDeg: number;
  out0: string;
  out1: string;
  fromPickId: string;
  pickLabel: string;
  retId: string;
}): { nodes: SchemaNode[]; edges: SchemaEdge[] } {
  const seekId = `n_${opts.prefix}_seek`;
  const loopId = `n_${opts.prefix}_L`;
  const nodes: SchemaNode[] = [
    { id: seekId, label: '# L_#', kind: 'builtin', builtinId: 'L_hash', x: 255, y: opts.seekY },
    { id: loopId, label: 'L', kind: 'move', x: 390, y: opts.seekY },
  ];
  const edges: SchemaEdge[] = [
    { id: `e_${opts.prefix}_pick`, from: opts.fromPickId, to: seekId, label: opts.pickLabel },
    { id: `e_${opts.prefix}_toL`, from: seekId, to: loopId, label: '' },
    {
      id: `e_${opts.prefix}_ab`,
      from: loopId,
      to: loopId,
      label: 'a, b',
      isSelfLoop: true,
      loopAngleDeg: opts.loopAngleDeg,
    },
  ];

  if (opts.out0 === opts.out1) {
    const wId = `n_${opts.prefix}_w`;
    nodes.push({ id: wId, label: opts.out0, kind: 'write', x: 505, y: opts.seekY });
    edges.push(
      { id: `e_${opts.prefix}_w`, from: loopId, to: wId, label: '0, 1, #' },
      { id: `e_${opts.prefix}_ret`, from: wId, to: opts.retId, label: '' },
    );
  } else {
    const w0Id = `n_${opts.prefix}_w0`;
    const w1Id = `n_${opts.prefix}_w1`;
    nodes.push(
      { id: w0Id, label: opts.out0, kind: 'write', x: 505, y: opts.writeTopY },
      { id: w1Id, label: opts.out1, kind: 'write', x: 505, y: opts.writeBotY },
    );
    edges.push(
      { id: `e_${opts.prefix}_w0`, from: loopId, to: w0Id, label: '0, #' },
      { id: `e_${opts.prefix}_ret0`, from: w0Id, to: opts.retId, label: '' },
      { id: `e_${opts.prefix}_w1`, from: loopId, to: w1Id, label: '1' },
      { id: `e_${opts.prefix}_ret1`, from: w1Id, to: opts.retId, label: '' },
    );
  }

  return { nodes, edges };
}

function buildTwoInputGate(
  op: TwoInputOp,
  table: [0 | 1, 0 | 1, 0 | 1, 0 | 1],
): TuringMachineDefinition {
  const meta = GATE_META[op];
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_pickB' },
    { id: 'q_pickB', label: 'Pick B LSB', x: 0, y: 0, schemaNodeId: 'n_pickB' },
    { id: 'q_toSep0', label: 'Carry 0 ←', x: 0, y: 0, schemaNodeId: 'n_c0_seek' },
    { id: 'q_findA0', label: `A ${meta.symbol} 0`, x: 0, y: 0, schemaNodeId: 'n_c0_L' },
    { id: 'q_toSep1', label: 'Carry 1 ←', x: 0, y: 0, schemaNodeId: 'n_c1_seek' },
    { id: 'q_findA1', label: `A ${meta.symbol} 1`, x: 0, y: 0, schemaNodeId: 'n_c1_L' },
    { id: 'q_retSep', label: 'To sep →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q_retEnd', label: 'To B end →', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q_fin', label: 'Finalize ←', x: 0, y: 0, schemaNodeId: 'n_dec_L' },
    { id: 'q_end', label: 'To End →', x: 0, y: 0, schemaNodeId: 'n_halt' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_halt' },
  ];

  // Markers: 'a' = output bit 0, 'b' = output bit 1
  const mark = (bit: 0 | 1): string => (bit === 0 ? 'a' : 'b');
  const r00 = mark(table[0]);
  const r01 = mark(table[1]);
  const r10 = mark(table[2]);
  const r11 = mark(table[3]);

  const transitions: TransitionRule[] = [
    makeRule('bg1', 'q0', '#', 'q_pickB', '#', 'L'),

    makeRule('bg2', 'q_pickB', '0', 'q_toSep0', '#', 'L'),
    makeRule('bg3', 'q_pickB', '1', 'q_toSep1', '#', 'L'),
    makeRule('bg4', 'q_pickB', '#', 'q_fin', '#', 'L'),

    // Carry 0 from B across B and separator # to LSB of A
    makeRule('bg5', 'q_toSep0', '0', 'q_toSep0', '0', 'L'),
    makeRule('bg6', 'q_toSep0', '1', 'q_toSep0', '1', 'L'),
    makeRule('bg7', 'q_toSep0', '#', 'q_findA0', '#', 'L'),

    makeRule('bg8', 'q_findA0', 'a', 'q_findA0', 'a', 'L'),
    makeRule('bg9', 'q_findA0', 'b', 'q_findA0', 'b', 'L'),
    makeRule('bg10', 'q_findA0', '0', 'q_retSep', r00, 'R'),
    makeRule('bg11', 'q_findA0', '1', 'q_retSep', r10, 'R'),
    makeRule('bg12', 'q_findA0', '#', 'q_retSep', r00, 'R'),

    // Carry 1 from B across B and separator # to LSB of A
    makeRule('bg13', 'q_toSep1', '0', 'q_toSep1', '0', 'L'),
    makeRule('bg14', 'q_toSep1', '1', 'q_toSep1', '1', 'L'),
    makeRule('bg15', 'q_toSep1', '#', 'q_findA1', '#', 'L'),

    makeRule('bg16', 'q_findA1', 'a', 'q_findA1', 'a', 'L'),
    makeRule('bg17', 'q_findA1', 'b', 'q_findA1', 'b', 'L'),
    makeRule('bg18', 'q_findA1', '0', 'q_retSep', r01, 'R'),
    makeRule('bg19', 'q_findA1', '1', 'q_retSep', r11, 'R'),
    makeRule('bg20', 'q_findA1', '#', 'q_retSep', r01, 'R'),

    // Return right across A, separator #, and remaining B
    makeRule('bg21', 'q_retSep', 'a', 'q_retSep', 'a', 'R'),
    makeRule('bg22', 'q_retSep', 'b', 'q_retSep', 'b', 'R'),
    makeRule('bg23', 'q_retSep', '0', 'q_retSep', '0', 'R'),
    makeRule('bg24', 'q_retSep', '1', 'q_retSep', '1', 'R'),
    makeRule('bg25', 'q_retSep', '#', 'q_retEnd', '#', 'R'),

    makeRule('bg26', 'q_retEnd', '0', 'q_retEnd', '0', 'R'),
    makeRule('bg27', 'q_retEnd', '1', 'q_retEnd', '1', 'R'),
    makeRule('bg28', 'q_retEnd', '#', 'q_pickB', '#', 'L'),

    // Decode markers (a->0, b->1) and apply f(A_bit, 0) to any leftover high bits of A
    makeRule('bg29', 'q_fin', 'a', 'q_fin', '0', 'L'),
    makeRule('bg30', 'q_fin', 'b', 'q_fin', '1', 'L'),
    makeRule('bg31', 'q_fin', '0', 'q_fin', String(table[0]), 'L'),
    makeRule('bg32', 'q_fin', '1', 'q_fin', String(table[2]), 'L'),
    makeRule('bg33', 'q_fin', '#', 'q_end', '#', 'R'),

    makeRule('bg34', 'q_end', '0', 'q_end', '0', 'R'),
    makeRule('bg35', 'q_end', '1', 'q_end', '1', 'R'),
    makeRule('bg36', 'q_end', '#', 'qH', '#', 'S'),
  ];

  const samplePairs: Array<[string, string, string]> = [
    ['101', '110', 'Equal length'],
    ['1100', '1010', '4-bit operands'],
    ['101', '1', 'A wider than B'],
    ['1', '101', 'B wider than A'],
  ];

  const sampleInputs: SampleInput[] = samplePairs.map(([a, b, desc]) => {
    const res = evalGateWord(a, b, table);
    return {
      label: `${a} ${meta.symbol} ${b} = ${res} (${desc})`,
      input: `#${a}#${b}#`,
      expectedOutput: `#${res}#`,
    };
  });

  const carry0 = buildCarrySchemaBranch({
    prefix: 'c0',
    seekY: 120,
    writeTopY: 86,
    writeBotY: 148,
    loopAngleDeg: -90,
    out0: r00,
    out1: r10,
    fromPickId: 'n_pickB',
    pickLabel: '0',
    retId: 'n_ret',
  });
  const carry1 = buildCarrySchemaBranch({
    prefix: 'c1',
    seekY: 275,
    writeTopY: 242,
    writeBotY: 304,
    loopAngleDeg: 90,
    out0: r01,
    out1: r11,
    fromPickId: 'n_pickB',
    pickLabel: '1',
    retId: 'n_ret',
  });
  const zeroReadSyms = [
    'a',
    ...(table[0] === 0 ? ['0'] : []),
    ...(table[2] === 0 ? ['1'] : []),
  ].join(', ');
  const oneReadSyms = [
    'b',
    ...(table[0] === 1 ? ['0'] : []),
    ...(table[2] === 1 ? ['1'] : []),
  ].join(', ');

  const tableStr = `[00→${table[0]}, 01→${table[1]}, 10→${table[2]}, 11→${table[3]}]`;
  return {
    id: `compiled-logic-${op.toLowerCase()}-${Date.now().toString(36)}`,
    name: meta.name,
    category: 'binary-logic',
    kind: 'transducer',
    description: `Computes bitwise ${op} (${tableStr}) on right-aligned #A#B# with implicit leading 0s when lengths differ.`,
    algorithmSummary:
      'Processes B from LSB to MSB, crossing # to combine with A (or implicit 0 when A ends) into markers a (0) and b (1). Once B exhausts, decodes a/b → 0/1, applies f(bit, 0) to any remaining high bits of A, and parks at the trailing #.',
    inputFormat: '#A#B# with A, B ∈ {0, 1}* (e.g., #101#110#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'a', 'b'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: `${meta.name} — L&P Schema`,
      width: 715,
      height: 585,
      nodes: [
        { id: 'n_pickB', label: '> L', kind: 'start-action', x: 85, y: 195 },
        ...carry0.nodes,
        ...carry1.nodes,
        { id: 'n_ret', label: 'R_# R_#', kind: 'builtin', builtinId: 'R_hash', x: 630, y: 195 },
        { id: 'n_dec_L', label: 'L', kind: 'move', x: 85, y: 405 },
        { id: 'n_dec_0', label: '0', kind: 'write', x: 265, y: 355 },
        { id: 'n_dec_1', label: '1', kind: 'write', x: 265, y: 455 },
        { id: 'n_halt', label: 'R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 85, y: 530 },
      ],
      edges: [
        ...carry0.edges,
        ...carry1.edges,
        { id: 'e_loop', from: 'n_ret', to: 'n_pickB', label: '#', curveOffset: -175 },
        { id: 'e_fin', from: 'n_pickB', to: 'n_dec_L', label: '#' },
        { id: 'e_dec0', from: 'n_dec_L', to: 'n_dec_0', label: zeroReadSyms, curveOffset: -24 },
        { id: 'e_dec0_ret', from: 'n_dec_0', to: 'n_dec_L', label: '', curveOffset: -24 },
        { id: 'e_dec1', from: 'n_dec_L', to: 'n_dec_1', label: oneReadSyms, curveOffset: 24 },
        { id: 'e_dec1_ret', from: 'n_dec_1', to: 'n_dec_L', label: '', curveOffset: 24 },
        { id: 'e_end', from: 'n_dec_L', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs,
    isCustom: true,
  };
}

function buildNot(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_flip' },
    { id: 'q_flip', label: 'Flip 0↔1 ←', x: 0, y: 0, schemaNodeId: 'n_flip' },
    { id: 'q_end', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_end' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_end' },
  ];
  const transitions: TransitionRule[] = [
    makeRule('bn1', 'q0', '#', 'q_flip', '#', 'L'),
    makeRule('bn2', 'q_flip', '0', 'q_flip', '1', 'L'),
    makeRule('bn3', 'q_flip', '1', 'q_flip', '0', 'L'),
    makeRule('bn4', 'q_flip', '#', 'q_end', '#', 'R'),
    makeRule('bn5', 'q_end', '0', 'q_end', '0', 'R'),
    makeRule('bn6', 'q_end', '1', 'q_end', '1', 'R'),
    makeRule('bn7', 'q_end', '#', 'qH', '#', 'S'),
  ];

  return {
    id: `compiled-logic-not-${Date.now().toString(36)}`,
    name: 'Binary Bitwise NOT (1’s Complement)',
    category: 'binary-logic',
    kind: 'transducer',
    description: 'Inverts every bit (0 ↔ 1) of #w# and parks at trailing #.',
    algorithmSummary:
      'Scans left toggling 0 ↔ 1 until the leading #, then scans right back to the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #10110#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Binary Bitwise NOT — L&P Schema',
      width: 420,
      height: 340,
      nodes: [
        { id: 'n_flip', label: '> L', kind: 'start-action', x: 115, y: 155 },
        { id: 'n_w1', label: '1', kind: 'write', x: 305, y: 95 },
        { id: 'n_w0', label: '0', kind: 'write', x: 305, y: 215 },
        { id: 'n_end', label: 'R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 115, y: 285 },
      ],
      edges: [
        { id: 'e_r0', from: 'n_flip', to: 'n_w1', label: '0', curveOffset: -22 },
        { id: 'e_b1', from: 'n_w1', to: 'n_flip', label: '', curveOffset: -22 },
        { id: 'e_r1', from: 'n_flip', to: 'n_w0', label: '1', curveOffset: 22 },
        { id: 'e_b0', from: 'n_w0', to: 'n_flip', label: '', curveOffset: 22 },
        { id: 'e_end', from: 'n_flip', to: 'n_end', label: '#' },
      ],
    },
    sampleInputs: [
      { label: 'NOT 10110 = 01001', input: '#10110#', expectedOutput: '#01001#' },
      { label: 'NOT 0 = 1', input: '#0#', expectedOutput: '#1#' },
      { label: 'Empty ε', input: '#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildInc(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_carry' },
    { id: 'q_carry', label: 'Carry +1 ←', x: 0, y: 0, schemaNodeId: 'n_carry' },
    { id: 'q_end', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_end' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_end' },
  ];
  const transitions: TransitionRule[] = [
    makeRule('bi1', 'q0', '#', 'q_carry', '#', 'L'),
    makeRule('bi2', 'q_carry', '1', 'q_carry', '0', 'L'),
    makeRule('bi3', 'q_carry', '0', 'q_end', '1', 'R'),
    makeRule('bi4', 'q_carry', '#', 'q_end', '1', 'R'),
    makeRule('bi5', 'q_end', '0', 'q_end', '0', 'R'),
    makeRule('bi6', 'q_end', '1', 'q_end', '1', 'R'),
    makeRule('bi7', 'q_end', '#', 'qH', '#', 'S'),
  ];

  return {
    id: `compiled-logic-inc-${Date.now().toString(36)}`,
    name: 'Binary Increment (+1)',
    category: 'binary-logic',
    kind: 'transducer',
    description: 'Computes w + 1 in binary, propagating carry leftwards.',
    algorithmSummary:
      'Flips trailing 1s to 0 moving left, turns the first 0 (or leading #) to 1, and scans right to park on the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #1011# → #1100#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Binary Increment (+1) — L&P Schema',
      width: 420,
      height: 290,
      nodes: [
        { id: 'n_carry', label: '> L', kind: 'start-action', x: 115, y: 165 },
        { id: 'n_w0', label: '0', kind: 'write', x: 300, y: 110 },
        { id: 'n_end', label: '1 R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 300, y: 230 },
      ],
      edges: [
        { id: 'e_1', from: 'n_carry', to: 'n_w0', label: '1', curveOffset: -24 },
        { id: 'e_back', from: 'n_w0', to: 'n_carry', label: '', curveOffset: -24 },
        { id: 'e_end', from: 'n_carry', to: 'n_end', label: '0, #' },
      ],
    },
    sampleInputs: [
      { label: '1011 + 1 = 1100', input: '#1011#', expectedOutput: '#1100#' },
      { label: '111 + 1 = 1000', input: '#111#', expectedOutput: '#1000#' },
      { label: '0 + 1 = 1', input: '#0#', expectedOutput: '#1#' },
      { label: 'Empty + 1 = 1', input: '#', expectedOutput: '#1#' },
    ],
    isCustom: true,
  };
}

function buildTwosComp(): TuringMachineDefinition {
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_skip0' },
    { id: 'q_skip0', label: 'Keep 0s / first 1 ←', x: 0, y: 0, schemaNodeId: 'n_skip0' },
    { id: 'q_flip', label: 'Flip 0↔1 ←', x: 0, y: 0, schemaNodeId: 'n_flip' },
    { id: 'q_end', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_end' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_end' },
  ];
  const transitions: TransitionRule[] = [
    makeRule('tc1', 'q0', '#', 'q_skip0', '#', 'L'),
    makeRule('tc2', 'q_skip0', '0', 'q_skip0', '0', 'L'),
    makeRule('tc3', 'q_skip0', '1', 'q_flip', '1', 'L'),
    makeRule('tc4', 'q_skip0', '#', 'q_end', '#', 'R'),
    makeRule('tc5', 'q_flip', '0', 'q_flip', '1', 'L'),
    makeRule('tc6', 'q_flip', '1', 'q_flip', '0', 'L'),
    makeRule('tc7', 'q_flip', '#', 'q_end', '#', 'R'),
    makeRule('tc8', 'q_end', '0', 'q_end', '0', 'R'),
    makeRule('tc9', 'q_end', '1', 'q_end', '1', 'R'),
    makeRule('tc10', 'q_end', '#', 'qH', '#', 'S'),
  ];

  return {
    id: `compiled-logic-twos-${Date.now().toString(36)}`,
    name: 'Binary Two’s Complement (−w)',
    category: 'binary-logic',
    kind: 'transducer',
    description:
      'Computes two’s complement negation on #w# by preserving trailing 0s and the rightmost 1, then inverting all higher bits.',
    algorithmSummary:
      'Scans left from trailing # keeping 0s until the first 1 (which is kept), then flips 0 ↔ 1 for all remaining bits leftwards to #, and returns right to the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #0100# → #1100#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: 'Binary Two’s Complement — L&P Schema',
      width: 560,
      height: 375,
      nodes: [
        { id: 'n_skip0', label: '> L', kind: 'start-action', x: 95, y: 175 },
        { id: 'n_flip', label: 'L', kind: 'move', x: 280, y: 175 },
        { id: 'n_w1', label: '1', kind: 'write', x: 465, y: 115 },
        { id: 'n_w0', label: '0', kind: 'write', x: 465, y: 235 },
        { id: 'n_end', label: 'R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 280, y: 315 },
      ],
      edges: [
        { id: 'e_0', from: 'n_skip0', to: 'n_skip0', label: '0', isSelfLoop: true, loopAngleDeg: -90 },
        { id: 'e_1', from: 'n_skip0', to: 'n_flip', label: '1' },
        { id: 'e_h0', from: 'n_skip0', to: 'n_end', label: '#' },
        { id: 'e_f0', from: 'n_flip', to: 'n_w1', label: '0', curveOffset: -22 },
        { id: 'e_b1', from: 'n_w1', to: 'n_flip', label: '', curveOffset: -22 },
        { id: 'e_f1', from: 'n_flip', to: 'n_w0', label: '1', curveOffset: 22 },
        { id: 'e_b0', from: 'n_w0', to: 'n_flip', label: '', curveOffset: 22 },
        { id: 'e_end', from: 'n_flip', to: 'n_end', label: '#' },
      ],
    },
    sampleInputs: [
      { label: '2sComp(0100) = 1100', input: '#0100#', expectedOutput: '#1100#' },
      { label: '2sComp(1010) = 0110', input: '#1010#', expectedOutput: '#0110#' },
      { label: '2sComp(0000) = 0000', input: '#0000#', expectedOutput: '#0000#' },
      { label: 'Empty ε', input: '#', expectedOutput: '#' },
    ],
    isCustom: true,
  };
}

function buildParity(target: 'even' | 'odd'): TuringMachineDefinition {
  const isEven = target === 'even';
  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_rew', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_even', label: 'Even 1s', x: 0, y: 0, schemaNodeId: 'n_even' },
    { id: 'q_odd', label: 'Odd 1s', x: 0, y: 0, schemaNodeId: 'n_odd' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];
  const transitions: TransitionRule[] = [
    makeRule('pr1', 'q0', '#', 'q_rew', '#', 'L'),
    makeRule('pr2', 'q_rew', '0', 'q_rew', '0', 'L'),
    makeRule('pr3', 'q_rew', '1', 'q_rew', '1', 'L'),
    makeRule('pr4', 'q_rew', '#', 'q_even', '#', 'R'),
    makeRule('pr5', 'q_even', '0', 'q_even', '#', 'R'),
    makeRule('pr6', 'q_even', '1', 'q_odd', '#', 'R'),
    makeRule('pr7', 'q_even', '#', isEven ? 'qH_acc' : 'qH_rej', isEven ? 'Ⓨ' : 'Ⓝ', 'R'),
    makeRule('pr8', 'q_odd', '0', 'q_odd', '#', 'R'),
    makeRule('pr9', 'q_odd', '1', 'q_even', '#', 'R'),
    makeRule('pr10', 'q_odd', '#', isEven ? 'qH_rej' : 'qH_acc', isEven ? 'Ⓝ' : 'Ⓨ', 'R'),
  ];

  return {
    id: `compiled-logic-${target}-parity-${Date.now().toString(36)}`,
    name: isEven ? 'Binary Even Parity Decider' : 'Binary Odd Parity Decider',
    category: 'binary-logic',
    kind: 'decider',
    description: `Decides whether #w# contains an ${target} number of 1 bits, outputting #Ⓨ# or #Ⓝ#.`,
    algorithmSummary: `Rewinds to the start of w, tracks parity mod 2 of 1s while erasing bits left-to-right, and writes ${isEven ? 'Ⓨ on even, Ⓝ on odd' : 'Ⓨ on odd, Ⓝ on even'} at the trailing #.`,
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #10110#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH_acc', 'qH_rej'],
    states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 115 }),
    transitions,
    schemaDiagram: {
      title: isEven ? 'Even Parity — L&P Schema' : 'Odd Parity — L&P Schema',
      width: 575,
      height: 335,
      nodes: [
        { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 145 },
        { id: 'n_even', label: '# R', kind: 'write', x: 275, y: 145 },
        { id: 'n_odd', label: '# R', kind: 'write', x: 465, y: 145 },
        { id: 'n_accept', label: 'Ⓨ R', kind: 'halt', variant: 'accept', x: isEven ? 275 : 465, y: 265 },
        { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: isEven ? 465 : 275, y: 265 },
      ],
      edges: [
        { id: 'e_rew', from: 'n_rew', to: 'n_even', label: 'R' },
        { id: 'e_e0', from: 'n_even', to: 'n_even', label: '0', isSelfLoop: true, loopAngleDeg: -90 },
        { id: 'e_e1', from: 'n_even', to: 'n_odd', label: '1' },
        { id: 'e_o0', from: 'n_odd', to: 'n_odd', label: '0', isSelfLoop: true, loopAngleDeg: -90 },
        { id: 'e_o1', from: 'n_odd', to: 'n_even', label: '1', curveOffset: -64 },
        { id: 'e_eh', from: 'n_even', to: isEven ? 'n_accept' : 'n_reject', label: '#' },
        { id: 'e_oh', from: 'n_odd', to: isEven ? 'n_reject' : 'n_accept', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: '1010 (2 ones)',
        input: '#1010#',
        expectedOutput: isEven ? '#Ⓨ#' : '#Ⓝ#',
        verdict: isEven ? 'accept' : 'reject',
      },
      {
        label: '1011 (3 ones)',
        input: '#1011#',
        expectedOutput: isEven ? '#Ⓝ#' : '#Ⓨ#',
        verdict: isEven ? 'reject' : 'accept',
      },
      {
        label: 'Empty ε (0 ones)',
        input: '#',
        expectedOutput: isEven ? '#Ⓨ#' : '#Ⓝ#',
        verdict: isEven ? 'accept' : 'reject',
      },
    ],
    isCustom: true,
  };
}

function isTwoInputOp(op: BinaryLogicOp): op is TwoInputOp {
  return op !== 'NOT' && op !== 'INC' && op !== 'TWOS_COMP' && op !== 'EVEN_PARITY' && op !== 'ODD_PARITY';
}

export function compileBinaryLogicToTm(spec: BinaryLogicSpec): CompileResult {
  if (isTwoInputOp(spec.op)) {
    const rawTable = spec.op === 'CUSTOM' ? spec.customTable : GATE_META[spec.op].table;
    const table: [0 | 1, 0 | 1, 0 | 1, 0 | 1] = [
      rawTable[0] ? 1 : 0,
      rawTable[1] ? 1 : 0,
      rawTable[2] ? 1 : 0,
      rawTable[3] ? 1 : 0,
    ];
    return { ok: true, machine: buildTwoInputGate(spec.op, table) };
  }

  switch (spec.op) {
    case 'NOT':
      return { ok: true, machine: buildNot() };
    case 'INC':
      return { ok: true, machine: buildInc() };
    case 'TWOS_COMP':
      return { ok: true, machine: buildTwosComp() };
    case 'EVEN_PARITY':
      return { ok: true, machine: buildParity('even') };
    case 'ODD_PARITY':
      return { ok: true, machine: buildParity('odd') };
  }
}
