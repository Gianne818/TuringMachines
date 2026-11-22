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

function buildEvenAs(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 95, y: 175, isStart: true },
    { id: 'q_rew', label: 'Rewind ←', x: 255, y: 175 },
    { id: 'q_even', label: 'Even a', x: 440, y: 115 },
    { id: 'q_odd', label: 'Odd a', x: 440, y: 245 },
    { id: 'qH', label: 'Halt', x: 640, y: 175, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('ea1', 'q0', '#', 'q_rew', '#', 'L'),
    makeRule('ea2', 'q_rew', 'a', 'q_rew', 'a', 'L'),
    makeRule('ea3', 'q_rew', 'b', 'q_rew', 'b', 'L'),
    makeRule('ea4', 'q_rew', '#', 'q_even', '#', 'R'),

    makeRule('ea5', 'q_even', 'a', 'q_odd', '#', 'R'),
    makeRule('ea6', 'q_even', 'b', 'q_even', '#', 'R'),
    makeRule('ea7', 'q_even', '#', 'qH', 'Ⓨ', 'R'),

    makeRule('ea8', 'q_odd', 'a', 'q_even', '#', 'R'),
    makeRule('ea9', 'q_odd', 'b', 'q_odd', '#', 'R'),
    makeRule('ea10', 'q_odd', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'reg-even-as',
    name: 'Even Number of a’s',
    category: 'regular',
    kind: 'decider',
    description:
      'Decides the regular language { w ∈ {a, b}* | w contains an even number of a’s }, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Rewinds from the trailing # to the start of w, then simulates the 2-state parity DFA left-to-right while erasing each symbol to #. On reaching trailing #, writes Ⓨ (even) or Ⓝ (odd) and moves R to #.',
    inputFormat: '#w# with w ∈ {a, b}* (e.g., #aabbaa#)',
    blankSymbol: '#',
    inputAlphabet: ['a', 'b'],
    tapeAlphabet: ['#', 'a', 'b', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '4 a’s (Accept)', input: '#aabbaa#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '2 a’s (Accept)', input: '#abba#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '3 a’s (Reject)', input: '#aabba#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty ε (Accept)', input: '#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
    ],
  };
}

function buildDivBy3(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 90, y: 195, isStart: true },
    { id: 'q_chk', label: 'Non-empty?', x: 235, y: 195 },
    { id: 'q_rew', label: 'Rewind ←', x: 385, y: 130 },
    { id: 'q_r0', label: 'mod 3 = 0', x: 560, y: 80 },
    { id: 'q_r1', label: 'mod 3 = 1', x: 715, y: 195 },
    { id: 'q_r2', label: 'mod 3 = 2', x: 560, y: 310 },
    { id: 'qH', label: 'Halt', x: 890, y: 195, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('d1', 'q0', '#', 'q_chk', '#', 'L'),
    makeRule('d2', 'q_chk', '#', 'qH', 'Ⓝ', 'R'),
    makeRule('d3', 'q_chk', '0', 'q_rew', '0', 'L'),
    makeRule('d4', 'q_chk', '1', 'q_rew', '1', 'L'),

    makeRule('d5', 'q_rew', '0', 'q_rew', '0', 'L'),
    makeRule('d6', 'q_rew', '1', 'q_rew', '1', 'L'),
    makeRule('d7', 'q_rew', '#', 'q_r0', '#', 'R'),

    makeRule('d8', 'q_r0', '0', 'q_r0', '#', 'R'),
    makeRule('d9', 'q_r0', '1', 'q_r1', '#', 'R'),
    makeRule('d10', 'q_r0', '#', 'qH', 'Ⓨ', 'R'),

    makeRule('d11', 'q_r1', '0', 'q_r2', '#', 'R'),
    makeRule('d12', 'q_r1', '1', 'q_r0', '#', 'R'),
    makeRule('d13', 'q_r1', '#', 'qH', 'Ⓝ', 'R'),

    makeRule('d14', 'q_r2', '0', 'q_r1', '#', 'R'),
    makeRule('d15', 'q_r2', '1', 'q_r2', '#', 'R'),
    makeRule('d16', 'q_r2', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'reg-div-3',
    name: 'Binary Divisible by 3',
    category: 'regular',
    kind: 'decider',
    description:
      'Decides whether a non-empty binary string represents a multiple of 3, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Rejects empty # immediately. Otherwise rewinds to the MSB and updates remainder r ∈ {0, 1, 2} via r′ = (2r + bit) mod 3 while erasing bits to #. Outputs #Ⓨ# iff r = 0 at the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}+ (e.g., #110# = 6)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '110 (6) Accept', input: '#110#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '1001 (9) Accept', input: '#1001#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '101 (5) Reject', input: '#101#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: '0 (0) Accept', input: '#0#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: 'Empty (Reject)', input: '#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
    ],
  };
}

function buildEndsWith01(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 95, y: 185, isStart: true },
    { id: 'q_rew', label: 'Rewind ←', x: 255, y: 185 },
    { id: 'q_none', label: 'Need 0', x: 430, y: 185 },
    { id: 'q_0', label: 'Saw 0', x: 600, y: 110 },
    { id: 'q_01', label: 'Saw 01', x: 600, y: 265 },
    { id: 'qH', label: 'Halt', x: 780, y: 185, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('e01_1', 'q0', '#', 'q_rew', '#', 'L'),
    makeRule('e01_2', 'q_rew', '0', 'q_rew', '0', 'L'),
    makeRule('e01_3', 'q_rew', '1', 'q_rew', '1', 'L'),
    makeRule('e01_4', 'q_rew', '#', 'q_none', '#', 'R'),

    makeRule('e01_5', 'q_none', '0', 'q_0', '#', 'R'),
    makeRule('e01_6', 'q_none', '1', 'q_none', '#', 'R'),
    makeRule('e01_7', 'q_none', '#', 'qH', 'Ⓝ', 'R'),

    makeRule('e01_8', 'q_0', '0', 'q_0', '#', 'R'),
    makeRule('e01_9', 'q_0', '1', 'q_01', '#', 'R'),
    makeRule('e01_10', 'q_0', '#', 'qH', 'Ⓝ', 'R'),

    makeRule('e01_11', 'q_01', '0', 'q_0', '#', 'R'),
    makeRule('e01_12', 'q_01', '1', 'q_none', '#', 'R'),
    makeRule('e01_13', 'q_01', '#', 'qH', 'Ⓨ', 'R'),
  ];

  return {
    id: 'reg-ends-01',
    name: 'Binary Ending in 01',
    category: 'regular',
    kind: 'decider',
    description:
      'Decides the regular language { w ∈ {0, 1}* | w ends with 01 }, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Rewinds to the start of w, tracks suffix state (none, saw 0, saw 01) while erasing each bit left-to-right, and writes Ⓨ or Ⓝ at the trailing # before stepping right.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #1101#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '1101 (Accept)', input: '#1101#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '01 (Accept)', input: '#01#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '1100 (Reject)', input: '#1100#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty (Reject)', input: '#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
    ],
  };
}

export const REGULAR_TEMPLATES: TuringMachineDefinition[] = [
  buildEvenAs(),
  buildDivBy3(),
  buildEndsWith01(),
];
