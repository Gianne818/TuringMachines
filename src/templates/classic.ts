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

function buildAnBnCn(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 185, isStart: true },
    { id: 'q_chk', label: 'Non-empty?', x: 225, y: 185 },
    { id: 'q_rewInit', label: 'To start ←', x: 370, y: 185 },
    { id: 'q_findA', label: 'Find a', x: 525, y: 120 },
    { id: 'q_findB', label: 'Find b', x: 690, y: 80 },
    { id: 'q_findC', label: 'Find c', x: 855, y: 80 },
    { id: 'q_rew', label: 'Rewind ←', x: 690, y: 205 },
    { id: 'q_doneChk', label: 'Only Y,Z?', x: 525, y: 270 },
    { id: 'q_wipeAcc', label: 'Clean (Ⓨ)', x: 690, y: 345 },
    { id: 'q_goEndRej', label: 'To end →', x: 855, y: 255 },
    { id: 'q_wipeRej', label: 'Clean (Ⓝ)', x: 855, y: 365 },
    { id: 'qH', label: 'Halt', x: 1020, y: 345, isHalt: true },
  ];

  const allWork = ['a', 'b', 'c', 'X', 'Y', 'Z'];
  const transitions: TransitionRule[] = [
    makeRule('csl1', 'q0', '#', 'q_chk', '#', 'L'),
    makeRule('csl2', 'q_chk', '#', 'qH', 'Ⓝ', 'R'),
    makeRule('csl3', 'q_chk', 'a', 'q_rewInit', 'a', 'L'),
    makeRule('csl4', 'q_chk', 'b', 'q_rewInit', 'b', 'L'),
    makeRule('csl5', 'q_chk', 'c', 'q_rewInit', 'c', 'L'),

    makeRule('csl6', 'q_rewInit', 'a', 'q_rewInit', 'a', 'L'),
    makeRule('csl7', 'q_rewInit', 'b', 'q_rewInit', 'b', 'L'),
    makeRule('csl8', 'q_rewInit', 'c', 'q_rewInit', 'c', 'L'),
    makeRule('csl9', 'q_rewInit', '#', 'q_findA', '#', 'R'),

    // Find next unmarked a
    makeRule('csl10', 'q_findA', 'X', 'q_findA', 'X', 'R'),
    makeRule('csl11', 'q_findA', 'a', 'q_findB', 'X', 'R'),
    makeRule('csl12', 'q_findA', 'Y', 'q_doneChk', 'Y', 'R'),
    makeRule('csl13', 'q_findA', 'b', 'q_goEndRej', 'X', 'R'),
    makeRule('csl14', 'q_findA', 'c', 'q_goEndRej', 'X', 'R'),
    makeRule('csl15', 'q_findA', 'Z', 'q_goEndRej', 'X', 'R'),
    makeRule('csl16', 'q_findA', '#', 'q_wipeRej', '#', 'L'),

    // Find next unmarked b
    makeRule('csl17', 'q_findB', 'a', 'q_findB', 'a', 'R'),
    makeRule('csl18', 'q_findB', 'Y', 'q_findB', 'Y', 'R'),
    makeRule('csl19', 'q_findB', 'b', 'q_findC', 'Y', 'R'),
    makeRule('csl20', 'q_findB', 'c', 'q_goEndRej', 'X', 'R'),
    makeRule('csl21', 'q_findB', 'Z', 'q_goEndRej', 'X', 'R'),
    makeRule('csl22', 'q_findB', 'X', 'q_goEndRej', 'X', 'R'),
    makeRule('csl23', 'q_findB', '#', 'q_wipeRej', '#', 'L'),

    // Find next unmarked c
    makeRule('csl24', 'q_findC', 'b', 'q_findC', 'b', 'R'),
    makeRule('csl25', 'q_findC', 'Z', 'q_findC', 'Z', 'R'),
    makeRule('csl26', 'q_findC', 'c', 'q_rew', 'Z', 'L'),
    makeRule('csl27', 'q_findC', 'a', 'q_goEndRej', 'X', 'R'),
    makeRule('csl28', 'q_findC', 'X', 'q_goEndRej', 'X', 'R'),
    makeRule('csl29', 'q_findC', 'Y', 'q_goEndRej', 'X', 'R'),
    makeRule('csl30', 'q_findC', '#', 'q_wipeRej', '#', 'L'),

    // Rewind all the way to leading #
    ...allWork.map((s, idx) => makeRule(`csl_rew_${idx}`, 'q_rew', s, 'q_rew', s, 'L')),
    makeRule('csl31', 'q_rew', '#', 'q_findA', '#', 'R'),

    // Verify only Y and Z remain until #
    makeRule('csl32', 'q_doneChk', 'Y', 'q_doneChk', 'Y', 'R'),
    makeRule('csl33', 'q_doneChk', 'Z', 'q_doneChk', 'Z', 'R'),
    makeRule('csl34', 'q_doneChk', 'a', 'q_goEndRej', 'X', 'R'),
    makeRule('csl35', 'q_doneChk', 'b', 'q_goEndRej', 'X', 'R'),
    makeRule('csl36', 'q_doneChk', 'c', 'q_goEndRej', 'X', 'R'),
    makeRule('csl37', 'q_doneChk', 'X', 'q_goEndRej', 'X', 'R'),
    makeRule('csl38', 'q_doneChk', '#', 'q_wipeAcc', '#', 'L'),

    // Clean X, Y, Z -> # for Ⓨ
    ...['X', 'Y', 'Z'].map((s, idx) =>
      makeRule(`csl_wa_${idx}`, 'q_wipeAcc', s, 'q_wipeAcc', '#', 'L'),
    ),
    makeRule('csl39', 'q_wipeAcc', '#', 'qH', 'Ⓨ', 'R'),

    // Sweep right then left to clean for Ⓝ
    ...allWork.map((s, idx) => makeRule(`csl_ge_${idx}`, 'q_goEndRej', s, 'q_goEndRej', 'X', 'R')),
    makeRule('csl40', 'q_goEndRej', '#', 'q_wipeRej', '#', 'L'),
    ...allWork.map((s, idx) => makeRule(`csl_wr_${idx}`, 'q_wipeRej', s, 'q_wipeRej', '#', 'L')),
    makeRule('csl41', 'q_wipeRej', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'tm-anbncn',
    name: 'Context-Sensitive aⁿbⁿcⁿ (n ≥ 1)',
    category: 'classic-tm',
    kind: 'decider',
    description:
      'Decides the canonical context-sensitive (non-CFL) language { aⁿbⁿcⁿ | n ≥ 1 }, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Rewinds to the start and iteratively marks one a → X, one b → Y, and one c → Z per sweep. Once all a’s are marked, verifies only Y’s and Z’s remain, erases all markers, and outputs #Ⓨ# (or #Ⓝ# on any order/count mismatch).',
    inputFormat: '#w# with w ∈ {a, b, c}* (e.g., #aabbcc#)',
    blankSymbol: '#',
    inputAlphabet: ['a', 'b', 'c'],
    tapeAlphabet: ['#', 'a', 'b', 'c', 'X', 'Y', 'Z', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: 'a²b²c² (Accept)', input: '#aabbcc#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: 'abc (Accept)', input: '#abc#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: 'a²b²c (Reject)', input: '#aabbc#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'abcabc (Reject)', input: '#abcabc#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty (Reject)', input: '#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
    ],
  };
}

function buildBinaryReverse(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 185, isStart: true },
    { id: 'q_pick', label: 'Pick bit ←', x: 245, y: 185 },
    { id: 'q_c0_in', label: 'Carry 0 →', x: 420, y: 85 },
    { id: 'q_c0_out', label: 'Write 0 →', x: 605, y: 85 },
    { id: 'q_c1_in', label: 'Carry 1 →', x: 420, y: 285 },
    { id: 'q_c1_out', label: 'Write 1 →', x: 605, y: 285 },
    { id: 'q_retOut', label: 'Back out ←', x: 775, y: 185 },
    { id: 'q_wipeX', label: 'Wipe X →', x: 245, y: 345 },
    { id: 'q_scanEnd', label: 'To end →', x: 420, y: 395 },
    { id: 'qH', label: 'Halt', x: 605, y: 395, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('rev1', 'q0', '#', 'q_pick', '#', 'L'),

    // Pick rightmost unmarked bit of w
    makeRule('rev2', 'q_pick', 'X', 'q_pick', 'X', 'L'),
    makeRule('rev3', 'q_pick', '0', 'q_c0_in', 'X', 'R'),
    makeRule('rev4', 'q_pick', '1', 'q_c1_in', 'X', 'R'),
    makeRule('rev5', 'q_pick', '#', 'q_wipeX', '#', 'R'),

    // Carry 0 across X's and separator # into reversed output region
    makeRule('rev6', 'q_c0_in', 'X', 'q_c0_in', 'X', 'R'),
    makeRule('rev7', 'q_c0_in', '#', 'q_c0_out', '#', 'R'),
    makeRule('rev8', 'q_c0_out', '0', 'q_c0_out', '0', 'R'),
    makeRule('rev9', 'q_c0_out', '1', 'q_c0_out', '1', 'R'),
    makeRule('rev10', 'q_c0_out', '#', 'q_retOut', '0', 'L'),

    // Carry 1 across X's and separator # into reversed output region
    makeRule('rev11', 'q_c1_in', 'X', 'q_c1_in', 'X', 'R'),
    makeRule('rev12', 'q_c1_in', '#', 'q_c1_out', '#', 'R'),
    makeRule('rev13', 'q_c1_out', '0', 'q_c1_out', '0', 'R'),
    makeRule('rev14', 'q_c1_out', '1', 'q_c1_out', '1', 'R'),
    makeRule('rev15', 'q_c1_out', '#', 'q_retOut', '1', 'L'),

    // Return across output region and separator # back to q_pick
    makeRule('rev16', 'q_retOut', '0', 'q_retOut', '0', 'L'),
    makeRule('rev17', 'q_retOut', '1', 'q_retOut', '1', 'L'),
    makeRule('rev18', 'q_retOut', '#', 'q_pick', '#', 'L'),

    // Wipe X's from left to separator #, then scan across reversed word to trailing #
    makeRule('rev19', 'q_wipeX', 'X', 'q_wipeX', '#', 'R'),
    makeRule('rev20', 'q_wipeX', '#', 'q_scanEnd', '#', 'R'),
    makeRule('rev21', 'q_scanEnd', '0', 'q_scanEnd', '0', 'R'),
    makeRule('rev22', 'q_scanEnd', '1', 'q_scanEnd', '1', 'R'),
    makeRule('rev23', 'q_scanEnd', '#', 'qH', '#', 'S'),
  ];

  return {
    id: 'tm-reverse',
    name: 'Binary String Reversal (wᴿ)',
    category: 'classic-tm',
    kind: 'transducer',
    description:
      'Reverses any binary string #w# into #wᴿ# with zero scratch symbols left and the head parked at the trailing #.',
    algorithmSummary:
      'Copies each bit of w from right to left (marking consumed bits as X) into a fresh block right of the separator #. Once all bits are X, erases X’s left-to-right and walks across wᴿ to park on the trailing #.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #1011# → #1101#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'X'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: 'rev(1011) = 1101', input: '#1011#', expectedOutput: '#1101#' },
      { label: 'rev(100) = 001', input: '#100#', expectedOutput: '#001#' },
      { label: 'rev(1) = 1', input: '#1#', expectedOutput: '#1#' },
      { label: 'Empty', input: '#', expectedOutput: '#' },
    ],
  };
}

export const CLASSIC_TEMPLATES: TuringMachineDefinition[] = [
  buildAnBnCn(),
  buildBinaryReverse(),
];
