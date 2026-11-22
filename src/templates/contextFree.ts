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

function buildAnBn(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 90, y: 185, isStart: true },
    { id: 'q_initR', label: 'Last sym', x: 235, y: 185 },
    { id: 'q_seekL', label: 'Seek left ←', x: 395, y: 110 },
    { id: 'q_chkL', label: 'First a?', x: 560, y: 110 },
    { id: 'q_seekR', label: 'Seek right →', x: 560, y: 265 },
    { id: 'q_chkR', label: 'Last b?', x: 395, y: 265 },
    { id: 'q_rejL', label: 'Wipe ← (Ⓝ)', x: 235, y: 345 },
    { id: 'q_rejR', label: 'Wipe → (Ⓝ)', x: 740, y: 185 },
    { id: 'qH', label: 'Halt', x: 740, y: 345, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    // Initial check: empty # is rejected since n >= 1
    makeRule('ab1', 'q0', '#', 'q_initR', '#', 'L'),
    makeRule('ab2', 'q_initR', '#', 'qH', 'Ⓝ', 'R'),
    makeRule('ab3', 'q_initR', 'a', 'q_rejL', '#', 'L'),
    makeRule('ab4', 'q_initR', 'b', 'q_seekL', '#', 'L'),

    // Walk left to leading #
    makeRule('ab5', 'q_seekL', 'a', 'q_seekL', 'a', 'L'),
    makeRule('ab6', 'q_seekL', 'b', 'q_seekL', 'b', 'L'),
    makeRule('ab7', 'q_seekL', '#', 'q_chkL', '#', 'R'),

    // Match leftmost a
    makeRule('ab8', 'q_chkL', 'a', 'q_seekR', '#', 'R'),
    makeRule('ab9', 'q_chkL', '#', 'qH', 'Ⓝ', 'R'),
    makeRule('ab10', 'q_chkL', 'b', 'q_rejR', '#', 'R'),

    // Walk right to trailing #
    makeRule('ab11', 'q_seekR', 'a', 'q_seekR', 'a', 'R'),
    makeRule('ab12', 'q_seekR', 'b', 'q_seekR', 'b', 'R'),
    makeRule('ab13', 'q_seekR', '#', 'q_chkR', '#', 'L'),

    // Match rightmost b or accept if empty
    makeRule('ab14', 'q_chkR', '#', 'qH', 'Ⓨ', 'R'),
    makeRule('ab15', 'q_chkR', 'b', 'q_seekL', '#', 'L'),
    makeRule('ab16', 'q_chkR', 'a', 'q_rejL', '#', 'L'),

    // Cleanup wipe left -> write Ⓝ
    makeRule('ab17', 'q_rejL', 'a', 'q_rejL', '#', 'L'),
    makeRule('ab18', 'q_rejL', 'b', 'q_rejL', '#', 'L'),
    makeRule('ab19', 'q_rejL', '#', 'qH', 'Ⓝ', 'R'),

    // Cleanup wipe right -> write Ⓝ
    makeRule('ab20', 'q_rejR', 'a', 'q_rejR', '#', 'R'),
    makeRule('ab21', 'q_rejR', 'b', 'q_rejR', '#', 'R'),
    makeRule('ab22', 'q_rejR', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'cfl-anbn',
    name: 'Balanced aⁿbⁿ (n ≥ 1)',
    category: 'context-free',
    kind: 'decider',
    description:
      'Decides the classic non-regular context-free language { aⁿbⁿ | n ≥ 1 }, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Peels matching outer pairs (leftmost a and rightmost b) by erasing them to #. Rejects empty # or mismatched symbols immediately after wiping remaining tape cells; accepts as #Ⓨ# once all pairs cancel cleanly.',
    inputFormat: '#w# with w ∈ {a, b}* (e.g., #aaabbb#)',
    blankSymbol: '#',
    inputAlphabet: ['a', 'b'],
    tapeAlphabet: ['#', 'a', 'b', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: 'a³b³ (Accept)', input: '#aaabbb#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: 'ab (Accept)', input: '#ab#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: 'a²b³ (Reject)', input: '#aabbb#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'abab (Reject)', input: '#abab#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty (Reject)', input: '#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
    ],
  };
}

function buildPalindrome(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 190, isStart: true },
    { id: 'q_pickR', label: 'Pick right', x: 235, y: 190 },
    { id: 'q_seekL0', label: 'Seek L (0)', x: 410, y: 95 },
    { id: 'q_chk0', label: 'Match 0', x: 585, y: 95 },
    { id: 'q_seekL1', label: 'Seek L (1)', x: 410, y: 285 },
    { id: 'q_chk1', label: 'Match 1', x: 585, y: 285 },
    { id: 'q_seekR', label: 'Seek right →', x: 755, y: 190 },
    { id: 'q_wipeR', label: 'Wipe → (Ⓝ)', x: 755, y: 345 },
    { id: 'qH', label: 'Halt', x: 920, y: 190, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('p1', 'q0', '#', 'q_pickR', '#', 'L'),

    makeRule('p2', 'q_pickR', '#', 'qH', 'Ⓨ', 'R'),
    makeRule('p3', 'q_pickR', '0', 'q_seekL0', '#', 'L'),
    makeRule('p4', 'q_pickR', '1', 'q_seekL1', '#', 'L'),

    // Seek left carrying 0
    makeRule('p5', 'q_seekL0', '0', 'q_seekL0', '0', 'L'),
    makeRule('p6', 'q_seekL0', '1', 'q_seekL0', '1', 'L'),
    makeRule('p7', 'q_seekL0', '#', 'q_chk0', '#', 'R'),

    makeRule('p8', 'q_chk0', '#', 'qH', 'Ⓨ', 'R'),
    makeRule('p9', 'q_chk0', '0', 'q_seekR', '#', 'R'),
    makeRule('p10', 'q_chk0', '1', 'q_wipeR', '#', 'R'),

    // Seek left carrying 1
    makeRule('p11', 'q_seekL1', '0', 'q_seekL1', '0', 'L'),
    makeRule('p12', 'q_seekL1', '1', 'q_seekL1', '1', 'L'),
    makeRule('p13', 'q_seekL1', '#', 'q_chk1', '#', 'R'),

    makeRule('p14', 'q_chk1', '#', 'qH', 'Ⓨ', 'R'),
    makeRule('p15', 'q_chk1', '1', 'q_seekR', '#', 'R'),
    makeRule('p16', 'q_chk1', '0', 'q_wipeR', '#', 'R'),

    // Walk right to trailing #
    makeRule('p17', 'q_seekR', '0', 'q_seekR', '0', 'R'),
    makeRule('p18', 'q_seekR', '1', 'q_seekR', '1', 'R'),
    makeRule('p19', 'q_seekR', '#', 'q_pickR', '#', 'L'),

    // Wipe remaining symbols rightwards and write Ⓝ
    makeRule('p20', 'q_wipeR', '0', 'q_wipeR', '#', 'R'),
    makeRule('p21', 'q_wipeR', '1', 'q_wipeR', '#', 'R'),
    makeRule('p22', 'q_wipeR', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'cfl-palindrome',
    name: 'Binary Palindrome (w = wᴿ)',
    category: 'context-free',
    kind: 'decider',
    description:
      'Decides whether a binary string reads identically forwards and backwards, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Reads and erases the rightmost bit (0 or 1), scans left to check the matching leftmost bit, erases it, and repeats inward. Odd center characters and empty tapes halt cleanly with #Ⓨ#; mismatches wipe remaining cells and output #Ⓝ#.',
    inputFormat: '#w# with w ∈ {0, 1}* (e.g., #101101#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '101101 (Accept)', input: '#101101#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '101 (Accept)', input: '#101#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '1010 (Reject)', input: '#1010#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty ε (Accept)', input: '#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
    ],
  };
}

function buildBalancedParens(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 90, y: 185, isStart: true },
    { id: 'q_rew', label: 'Rewind ←', x: 245, y: 185 },
    { id: 'q_scan', label: 'Find ) →', x: 420, y: 185 },
    { id: 'q_match', label: 'Find ( ←', x: 595, y: 100 },
    { id: 'q_verify', label: 'Verify ←', x: 595, y: 275 },
    { id: 'q_wipeL', label: 'Wipe ← (Ⓝ)', x: 775, y: 275 },
    { id: 'q_wipeR', label: 'Wipe → (Ⓝ)', x: 775, y: 100 },
    { id: 'qH', label: 'Halt', x: 945, y: 185, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('bp1', 'q0', '#', 'q_rew', '#', 'L'),
    makeRule('bp2', 'q_rew', '(', 'q_rew', '(', 'L'),
    makeRule('bp3', 'q_rew', ')', 'q_rew', ')', 'L'),
    makeRule('bp4', 'q_rew', '#', 'q_scan', '#', 'R'),

    // Scan right for next unmatched )
    makeRule('bp5', 'q_scan', '(', 'q_scan', '(', 'R'),
    makeRule('bp6', 'q_scan', 'X', 'q_scan', 'X', 'R'),
    makeRule('bp7', 'q_scan', ')', 'q_match', 'X', 'L'),
    makeRule('bp8', 'q_scan', '#', 'q_verify', '#', 'L'),

    // Scan left to match nearest (
    makeRule('bp9', 'q_match', 'X', 'q_match', 'X', 'L'),
    makeRule('bp10', 'q_match', '(', 'q_scan', 'X', 'R'),
    makeRule('bp11', 'q_match', '#', 'q_wipeR', '#', 'R'),

    // Verify no unmatched ( remain while erasing X's leftwards
    makeRule('bp12', 'q_verify', 'X', 'q_verify', '#', 'L'),
    makeRule('bp13', 'q_verify', '(', 'q_wipeL', '#', 'L'),
    makeRule('bp14', 'q_verify', '#', 'qH', 'Ⓨ', 'R'),

    // Cleanup for reject
    makeRule('bp15', 'q_wipeL', '(', 'q_wipeL', '#', 'L'),
    makeRule('bp16', 'q_wipeL', 'X', 'q_wipeL', '#', 'L'),
    makeRule('bp17', 'q_wipeL', '#', 'qH', 'Ⓝ', 'R'),

    makeRule('bp18', 'q_wipeR', '(', 'q_wipeR', '#', 'R'),
    makeRule('bp19', 'q_wipeR', ')', 'q_wipeR', '#', 'R'),
    makeRule('bp20', 'q_wipeR', 'X', 'q_wipeR', '#', 'R'),
    makeRule('bp21', 'q_wipeR', '#', 'qH', 'Ⓝ', 'R'),
  ];

  return {
    id: 'cfl-parens',
    name: 'Balanced Parentheses',
    category: 'context-free',
    kind: 'decider',
    description:
      'Decides whether parentheses in { (, ) }* are properly nested and balanced, outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Rewinds to the start, finds each leftmost closing parenthesis ) and pairs it with the nearest preceding ( by marking both as X. After all ) are paired, verifies leftwards that no unmatched ( remain while erasing X markers to #.',
    inputFormat: '#w# with w ∈ { (, ) }* (e.g., #(()())#)',
    blankSymbol: '#',
    inputAlphabet: ['(', ')'],
    tapeAlphabet: ['#', '(', ')', 'X', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '(()()) (Accept)', input: '#(()())#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '()() (Accept)', input: '#()()#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '(() (Reject)', input: '#(()#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: ')( (Reject)', input: '#)(#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'Empty ε (Accept)', input: '#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
    ],
  };
}

export const CONTEXT_FREE_TEMPLATES: TuringMachineDefinition[] = [
  buildAnBn(),
  buildPalindrome(),
  buildBalancedParens(),
];
