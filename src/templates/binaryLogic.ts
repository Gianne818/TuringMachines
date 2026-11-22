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

function buildBitwiseNot(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 100, y: 155, isStart: true },
    { id: 'q_flip', label: 'Flip 0↔1 ←', x: 280, y: 155 },
    { id: 'q_end', label: 'To end →', x: 470, y: 155 },
    { id: 'qH', label: 'Halt', x: 650, y: 155, isHalt: true },
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
    id: 'logic-not',
    name: 'Binary Bitwise NOT (1’s Complement)',
    category: 'binary-logic',
    kind: 'transducer',
    description:
      'Inverts every bit (0 ↔ 1) of a binary string #w# and parks the head at the trailing #.',
    algorithmSummary:
      'Scans left across w toggling 0 ↔ 1 until reaching the leading #, then runs R_# back across the inverted string to park on the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #10110#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: 'NOT 10110', input: '#10110#', expectedOutput: '#01001#' },
      { label: 'NOT 1111', input: '#1111#', expectedOutput: '#0000#' },
      { label: 'NOT 0', input: '#0#', expectedOutput: '#1#' },
      { label: 'Empty', input: '#', expectedOutput: '#' },
    ],
  };
}

function buildBinaryIncrement(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 100, y: 165, isStart: true },
    { id: 'q_carry', label: 'Add +1 / Carry', x: 285, y: 165 },
    { id: 'q_end', label: 'To end →', x: 480, y: 165 },
    { id: 'qH', label: 'Halt', x: 665, y: 165, isHalt: true },
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
    id: 'logic-inc',
    name: 'Binary Increment (+1)',
    category: 'binary-logic',
    kind: 'transducer',
    description:
      'Computes w + 1 in binary, propagating carries leftward (expanding width on all-1s overflow) and parking at trailing #.',
    algorithmSummary:
      'Steps left from trailing #: flips trailing 1s to 0 while propagating carry, converts the first 0 (or leading #) to 1, then scans right back to the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #1011# → #1100#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '1011 + 1 = 1100', input: '#1011#', expectedOutput: '#1100#' },
      { label: '111 + 1 = 1000', input: '#111#', expectedOutput: '#1000#' },
      { label: '0 + 1 = 1', input: '#0#', expectedOutput: '#1#' },
      { label: 'Empty + 1 = 1', input: '#', expectedOutput: '#1#' },
    ],
  };
}

function buildBitwiseGate(mode: 'xor' | 'and'): TuringMachineDefinition {
  const isXor = mode === 'xor';
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 195, isStart: true },
    { id: 'q_pickB', label: 'Pick B LSB', x: 245, y: 195 },
    { id: 'q_toSep0', label: 'Carry 0 ←', x: 415, y: 95 },
    { id: 'q_findA0', label: isXor ? 'A ⊕ 0' : 'A ∧ 0', x: 590, y: 95 },
    { id: 'q_toSep1', label: 'Carry 1 ←', x: 415, y: 295 },
    { id: 'q_findA1', label: isXor ? 'A ⊕ 1' : 'A ∧ 1', x: 590, y: 295 },
    { id: 'q_retSep', label: 'To sep →', x: 765, y: 195 },
    { id: 'q_retEnd', label: 'To B end →', x: 765, y: 345 },
    { id: 'q_fin', label: 'Decode a,b', x: 245, y: 345 },
    { id: 'q_end', label: 'To End →', x: 415, y: 395 },
    { id: 'qH', label: 'Halt', x: 590, y: 395, isHalt: true },
  ];

  // Markers: 'a' = result bit 0, 'b' = result bit 1
  const xor00 = 'a';
  const xor10 = 'b';
  const xor01 = 'b';
  const xor11 = 'a';

  const and00 = 'a';
  const and10 = 'a';
  const and01 = 'a';
  const and11 = 'b';

  const r00 = isXor ? xor00 : and00;
  const r10 = isXor ? xor10 : and10;
  const r01 = isXor ? xor01 : and01;
  const r11 = isXor ? xor11 : and11;

  const transitions: TransitionRule[] = [
    makeRule('bg1', 'q0', '#', 'q_pickB', '#', 'L'),

    makeRule('bg2', 'q_pickB', '0', 'q_toSep0', '#', 'L'),
    makeRule('bg3', 'q_pickB', '1', 'q_toSep1', '#', 'L'),
    makeRule('bg4', 'q_pickB', '#', 'q_fin', '#', 'L'),

    // Carry 0 across B -> separator -> find LSB of A
    makeRule('bg5', 'q_toSep0', '0', 'q_toSep0', '0', 'L'),
    makeRule('bg6', 'q_toSep0', '1', 'q_toSep0', '1', 'L'),
    makeRule('bg7', 'q_toSep0', '#', 'q_findA0', '#', 'L'),

    makeRule('bg8', 'q_findA0', 'a', 'q_findA0', 'a', 'L'),
    makeRule('bg9', 'q_findA0', 'b', 'q_findA0', 'b', 'L'),
    makeRule('bg10', 'q_findA0', '0', 'q_retSep', r00, 'R'),
    makeRule('bg11', 'q_findA0', '1', 'q_retSep', r10, 'R'),
    makeRule('bg12', 'q_findA0', '#', 'q_retSep', r00, 'R'),

    // Carry 1 across B -> separator -> find LSB of A
    makeRule('bg13', 'q_toSep1', '0', 'q_toSep1', '0', 'L'),
    makeRule('bg14', 'q_toSep1', '1', 'q_toSep1', '1', 'L'),
    makeRule('bg15', 'q_toSep1', '#', 'q_findA1', '#', 'L'),

    makeRule('bg16', 'q_findA1', 'a', 'q_findA1', 'a', 'L'),
    makeRule('bg17', 'q_findA1', 'b', 'q_findA1', 'b', 'L'),
    makeRule('bg18', 'q_findA1', '0', 'q_retSep', r01, 'R'),
    makeRule('bg19', 'q_findA1', '1', 'q_retSep', r11, 'R'),
    makeRule('bg20', 'q_findA1', '#', 'q_retSep', r01, 'R'),

    // Return back right across A, separator #, and remaining B
    makeRule('bg21', 'q_retSep', 'a', 'q_retSep', 'a', 'R'),
    makeRule('bg22', 'q_retSep', 'b', 'q_retSep', 'b', 'R'),
    makeRule('bg23', 'q_retSep', '0', 'q_retSep', '0', 'R'),
    makeRule('bg24', 'q_retSep', '1', 'q_retSep', '1', 'R'),
    makeRule('bg25', 'q_retSep', '#', 'q_retEnd', '#', 'R'),

    makeRule('bg26', 'q_retEnd', '0', 'q_retEnd', '0', 'R'),
    makeRule('bg27', 'q_retEnd', '1', 'q_retEnd', '1', 'R'),
    makeRule('bg28', 'q_retEnd', '#', 'q_pickB', '#', 'L'),

    // Decode markers (a->0, b->1) leftwards, preserving any leftover high bits of A, then scan right to trailing #
    makeRule('bg29', 'q_fin', 'a', 'q_fin', '0', 'L'),
    makeRule('bg30', 'q_fin', 'b', 'q_fin', '1', 'L'),
    makeRule('bg31', 'q_fin', '0', 'q_fin', '0', 'L'),
    makeRule('bg32', 'q_fin', '1', 'q_fin', '1', 'L'),
    makeRule('bg33', 'q_fin', '#', 'q_end', '#', 'R'),

    makeRule('bg34', 'q_end', '0', 'q_end', '0', 'R'),
    makeRule('bg35', 'q_end', '1', 'q_end', '1', 'R'),
    makeRule('bg36', 'q_end', '#', 'qH', '#', 'S'),
  ];

  if (isXor) {
    return {
      id: 'logic-xor',
      name: 'Binary Bitwise XOR (A ⊕ B)',
      category: 'binary-logic',
      kind: 'transducer',
      description:
        'Computes bitwise A ⊕ B on two # -separated binary strings, outputting #result# with head at trailing #.',
      algorithmSummary:
        'Consumes B bit-by-bit from LSB to MSB, crossing the separator # to combine with A’s corresponding bit into temporary output markers a (0) and b (1). Once B is exhausted, decodes a/b → 0/1 and parks at the # immediately after the result.',
      inputFormat: '#A#B# with A, B ∈ {0, 1}* (e.g., #101#110#)',
      blankSymbol: '#',
      inputAlphabet: ['0', '1'],
      tapeAlphabet: ['#', '0', '1', 'a', 'b'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH'],
      states,
      transitions,
      sampleInputs: [
        { label: '101 ⊕ 110 = 011', input: '#101#110#', expectedOutput: '#011#' },
        { label: '1100 ⊕ 1010 = 0110', input: '#1100#1010#', expectedOutput: '#0110#' },
        { label: '101 ⊕ 101 = 000', input: '#101#101#', expectedOutput: '#000#' },
        { label: '1 ⊕ 10 = 11', input: '#1#10#', expectedOutput: '#11#' },
      ],
    };
  }

  return {
    id: 'logic-and',
    name: 'Binary Bitwise AND (A ∧ B)',
    category: 'binary-logic',
    kind: 'transducer',
    description:
      'Computes bitwise A ∧ B on two # -separated binary strings, outputting #result# with head at trailing #.',
    algorithmSummary:
      'Processes B from LSB to MSB, crossing # to combine each bit with A using AND truth rules into temporary markers a (0) and b (1), then decodes a/b → 0/1 and parks on the trailing #.',
    inputFormat: '#A#B# with A, B ∈ {0, 1}* (e.g., #101#110#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'a', 'b'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '101 ∧ 110 = 100', input: '#101#110#', expectedOutput: '#100#' },
      { label: '1101 ∧ 1011 = 1001', input: '#1101#1011#', expectedOutput: '#1001#' },
      { label: '101 ∧ 010 = 000', input: '#101#010#', expectedOutput: '#000#' },
    ],
  };
}

export const BINARY_LOGIC_TEMPLATES: TuringMachineDefinition[] = [
  buildBitwiseNot(),
  buildBinaryIncrement(),
  buildBitwiseGate('xor'),
  buildBitwiseGate('and'),
];
