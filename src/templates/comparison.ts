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

function buildUnaryComparator(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 85, y: 185, isStart: true },
    { id: 'q1', label: 'Check n', x: 235, y: 185 },
    { id: 'q2', label: 'Skip n ←', x: 400, y: 105 },
    { id: 'q3', label: 'Check m', x: 565, y: 105 },
    { id: 'q4', label: 'Rewind m', x: 735, y: 65 },
    { id: 'q5', label: 'Erase m[0]', x: 735, y: 195 },
    { id: 'q6', label: 'Return →', x: 565, y: 245 },
    { id: 'q7', label: 'Skip n →', x: 400, y: 245 },
    { id: 'q_chkM_end', label: 'n=0, chk m', x: 235, y: 335 },
    { id: 'q_gt', label: 'Wipe m (>)', x: 400, y: 375 },
    { id: 'q_lt_sep', label: 'm=0, to n', x: 735, y: 325 },
    { id: 'q_lt_wipe', label: 'Wipe n (<)', x: 565, y: 375 },
    { id: 'qH', label: 'Halt', x: 235, y: 455, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('uc1', 'q0', '#', 'q1', '#', 'L'),

    // q1: inspect rightmost cell of n
    makeRule('uc2', 'q1', 'I', 'q2', '#', 'L'),
    makeRule('uc3', 'q1', '#', 'q_chkM_end', '#', 'L'),

    // n reached 0: if m still has I => m > n; if # => m = n
    makeRule('uc4', 'q_chkM_end', 'I', 'q_gt', '#', 'L'),
    makeRule('uc5', 'q_chkM_end', '#', 'qH', '=', 'R'),

    makeRule('uc6', 'q_gt', 'I', 'q_gt', '#', 'L'),
    makeRule('uc7', 'q_gt', '#', 'qH', '>', 'R'),

    // Skip remaining n leftwards
    makeRule('uc8', 'q2', 'I', 'q2', 'I', 'L'),
    makeRule('uc9', 'q2', '#', 'q3', '#', 'L'),

    // Check m after erasing one I from n
    makeRule('uc10', 'q3', 'I', 'q4', 'I', 'L'),
    makeRule('uc11', 'q3', '#', 'q_lt_sep', '#', 'R'),

    // Rewind m -> erase leftmost I
    makeRule('uc12', 'q4', 'I', 'q4', 'I', 'L'),
    makeRule('uc13', 'q4', '#', 'q5', '#', 'R'),
    makeRule('uc14', 'q5', 'I', 'q6', '#', 'R'),

    // Return right across m and n to trailing #
    makeRule('uc15', 'q6', 'I', 'q6', 'I', 'R'),
    makeRule('uc16', 'q6', '#', 'q7', '#', 'R'),
    makeRule('uc17', 'q7', 'I', 'q7', 'I', 'R'),
    makeRule('uc18', 'q7', '#', 'q0', '#', 'S'),

    // m exhausted while n had remaining I => m < n
    makeRule('uc19', 'q_lt_sep', '#', 'q_lt_wipe', '#', 'R'),
    makeRule('uc20', 'q_lt_wipe', 'I', 'q_lt_wipe', '#', 'R'),
    makeRule('uc21', 'q_lt_wipe', '#', 'qH', '<', 'R'),
  ];

  return {
    id: 'comp-unary',
    name: 'Unary Comparator (<, =, >)',
    category: 'comparison',
    kind: 'transducer',
    description:
      'Compares two unary tallies #I^m#I^n# and outputs #<#, #=#, or #># with the head parked on the trailing #.',
    algorithmSummary:
      'Cancels one I from n and one I from m per round. If n empties while m retains I’s, wipes m and writes >; if both empty simultaneously, writes =; if m empties while n had an I, wipes n and writes <.',
    inputFormat: '#I^m#I^n# (e.g., #III#II# → #>#)',
    blankSymbol: '#',
    inputAlphabet: ['I'],
    tapeAlphabet: ['#', 'I', '<', '=', '>'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '3 > 2', input: '#III#II#', expectedOutput: '#>#' },
      { label: '2 = 2', input: '#II#II#', expectedOutput: '#=#' },
      { label: '2 < 3', input: '#II#III#', expectedOutput: '#<#' },
      { label: '3 > 0', input: '#III##', expectedOutput: '#>#' },
      { label: '0 < 2', input: '##II#', expectedOutput: '#<#' },
      { label: '0 = 0', input: '###', expectedOutput: '#=#' },
    ],
  };
}

function buildBinaryEquality(): TuringMachineDefinition {
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 80, y: 210, isStart: true },
    { id: 'q_chkW2', label: 'Check w₂', x: 220, y: 210 },
    { id: 'q_w2E', label: 'w₂ empty', x: 220, y: 365 },
    { id: 'q_rewW2', label: 'Rew w₂ ←', x: 375, y: 135 },
    { id: 'q_chkW1', label: 'Check w₁', x: 530, y: 135 },
    { id: 'q_rewW1', label: 'Rew w₁ ←', x: 685, y: 135 },
    { id: 'q_pick', label: 'Pick w₁', x: 845, y: 135 },
    { id: 'q_c0', label: 'Carry 0 →', x: 1015, y: 65 },
    { id: 'q_m0', label: 'Match 0', x: 1185, y: 65 },
    { id: 'q_c1', label: 'Carry 1 →', x: 1015, y: 215 },
    { id: 'q_m1', label: 'Match 1', x: 1185, y: 215 },
    { id: 'q_back', label: 'Rewind ←', x: 1015, y: 315 },
    { id: 'q_chkEnd', label: 'w₂ done?', x: 845, y: 280 },
    { id: 'q_wipeAcc', label: 'Clean (Ⓨ)', x: 685, y: 350 },
    { id: 'q_goEndRej', label: 'Wipe →', x: 1185, y: 350 },
    { id: 'q_wipeRej', label: 'Clean (Ⓝ)', x: 530, y: 390 },
    { id: 'qH', label: 'Halt', x: 375, y: 440, isHalt: true },
  ];

  const transitions: TransitionRule[] = [
    makeRule('eq1', 'q0', '#', 'q_chkW2', '#', 'L'),

    // Check if w2 is non-empty
    makeRule('eq2', 'q_chkW2', '#', 'q_w2E', '#', 'L'),
    makeRule('eq3', 'q_chkW2', '0', 'q_rewW2', '0', 'L'),
    makeRule('eq4', 'q_chkW2', '1', 'q_rewW2', '1', 'L'),

    // w2 empty: accept iff w1 also empty
    makeRule('eq5', 'q_w2E', '#', 'qH', 'Ⓨ', 'R'),
    makeRule('eq6', 'q_w2E', '0', 'q_wipeRej', '#', 'L'),
    makeRule('eq7', 'q_w2E', '1', 'q_wipeRej', '#', 'L'),

    // Rewind w2 to separator #, mark separator as S
    makeRule('eq8', 'q_rewW2', '0', 'q_rewW2', '0', 'L'),
    makeRule('eq9', 'q_rewW2', '1', 'q_rewW2', '1', 'L'),
    makeRule('eq10', 'q_rewW2', '#', 'q_chkW1', 'S', 'L'),

    // Check w1 non-empty (if empty while w2 non-empty => reject)
    makeRule('eq11', 'q_chkW1', '#', 'q_goEndRej', '#', 'R'),
    makeRule('eq12', 'q_chkW1', '0', 'q_rewW1', '0', 'L'),
    makeRule('eq13', 'q_chkW1', '1', 'q_rewW1', '1', 'L'),

    // Rewind w1 to leading #
    makeRule('eq14', 'q_rewW1', '0', 'q_rewW1', '0', 'L'),
    makeRule('eq15', 'q_rewW1', '1', 'q_rewW1', '1', 'L'),
    makeRule('eq16', 'q_rewW1', '#', 'q_pick', '#', 'R'),

    // Pick leftmost unmatched bit of w1
    makeRule('eq17', 'q_pick', 'X', 'q_pick', 'X', 'R'),
    makeRule('eq18', 'q_pick', '0', 'q_c0', 'X', 'R'),
    makeRule('eq19', 'q_pick', '1', 'q_c1', 'X', 'R'),
    makeRule('eq20', 'q_pick', 'S', 'q_chkEnd', 'S', 'R'),

    // Carry 0 across w1 and S into w2
    makeRule('eq21', 'q_c0', '0', 'q_c0', '0', 'R'),
    makeRule('eq22', 'q_c0', '1', 'q_c0', '1', 'R'),
    makeRule('eq23', 'q_c0', 'S', 'q_m0', 'S', 'R'),

    makeRule('eq24', 'q_m0', 'X', 'q_m0', 'X', 'R'),
    makeRule('eq25', 'q_m0', '0', 'q_back', 'X', 'L'),
    makeRule('eq26', 'q_m0', '1', 'q_goEndRej', '#', 'R'),
    makeRule('eq27', 'q_m0', '#', 'q_wipeRej', '#', 'L'),

    // Carry 1 across w1 and S into w2
    makeRule('eq28', 'q_c1', '0', 'q_c1', '0', 'R'),
    makeRule('eq29', 'q_c1', '1', 'q_c1', '1', 'R'),
    makeRule('eq30', 'q_c1', 'S', 'q_m1', 'S', 'R'),

    makeRule('eq31', 'q_m1', 'X', 'q_m1', 'X', 'R'),
    makeRule('eq32', 'q_m1', '1', 'q_back', 'X', 'L'),
    makeRule('eq33', 'q_m1', '0', 'q_goEndRej', '#', 'R'),
    makeRule('eq34', 'q_m1', '#', 'q_wipeRej', '#', 'L'),

    // Rewind back across w2, S, w1 to leading #
    makeRule('eq35', 'q_back', 'X', 'q_back', 'X', 'L'),
    makeRule('eq36', 'q_back', 'S', 'q_back', 'S', 'L'),
    makeRule('eq37', 'q_back', '0', 'q_back', '0', 'L'),
    makeRule('eq38', 'q_back', '1', 'q_back', '1', 'L'),
    makeRule('eq39', 'q_back', '#', 'q_pick', '#', 'R'),

    // w1 exhausted: verify w2 has no remaining 0/1
    makeRule('eq40', 'q_chkEnd', 'X', 'q_chkEnd', 'X', 'R'),
    makeRule('eq41', 'q_chkEnd', '#', 'q_wipeAcc', '#', 'L'),
    makeRule('eq42', 'q_chkEnd', '0', 'q_goEndRej', '#', 'R'),
    makeRule('eq43', 'q_chkEnd', '1', 'q_goEndRej', '#', 'R'),

    // Clean all X, S leftwards and write Ⓨ
    makeRule('eq44', 'q_wipeAcc', 'X', 'q_wipeAcc', '#', 'L'),
    makeRule('eq45', 'q_wipeAcc', 'S', 'q_wipeAcc', '#', 'L'),
    makeRule('eq46', 'q_wipeAcc', '#', 'qH', 'Ⓨ', 'R'),

    // Sweep right to trailing # wiping remaining bits, then sweep left wiping everything for Ⓝ
    makeRule('eq47', 'q_goEndRej', 'S', 'q_goEndRej', '#', 'R'),
    makeRule('eq48', 'q_goEndRej', '0', 'q_goEndRej', '#', 'R'),
    makeRule('eq49', 'q_goEndRej', '1', 'q_goEndRej', '#', 'R'),
    makeRule('eq50', 'q_goEndRej', 'X', 'q_goEndRej', '#', 'R'),
    makeRule('eq51', 'q_goEndRej', '#', 'q_wipeRej', '#', 'L'),

    makeRule('eq52', 'q_wipeRej', '0', 'q_wipeRej', '#', 'L'),
    makeRule('eq53', 'q_wipeRej', '1', 'q_wipeRej', '#', 'L'),
    makeRule('eq54', 'q_wipeRej', 'X', 'q_wipeRej', '#', 'L'),
    makeRule('eq55', 'q_wipeRej', 'S', 'q_wipeRej', '#', 'L'),
    makeRule('eq56', 'q_wipeRej', '#', 'q_wipeRej_chk', '#', 'L'),
  ];

  // Wait: if q_wipeRej hits '#' while wiping from right (or if S was turned into # in q_goEndRej),
  // notice q_goEndRej turned EVERYTHING on the right (including S) into '#'!!
  // Wait: if q_goEndRej turned index 4 (S) into '#' and 5..7 into '#', then at index 8 (#) moving L hits 7(#)!!
  // Let's fix that cleanly: keep S as 'X' in q_goEndRej so there is NO '#' gap until index 0!
  // Let's check: if q_goEndRej writes 'X' for S, 0, 1, X (or wait: what if w1 was empty `##101#`, so 1..3 didn't exist? Then S is at index 1, 0 is #, and turning S-># at 1 means from trailing # we need to scan left across #'s OR just leave S as X and wipe X's leftwards!).
  // Even simpler: in q_goEndRej, on S/0/1/X write '#' ONLY on the way back? NO — on q_goEndRej just leave X and S as-is (write 'X') while moving R to trailing #, THEN q_wipeRej erases X/S/0/1 -> '#' moving L to index 0 (#)!
  // Let's check `##101#` with `q_chkW1` seeing `#(0)`!
  // On `##101#`: `0:#, 1:S, 2:1, 3:0, 4:1, 5:#`.
  // `q_chkW1` at `0(#)` goes `R` to `q_goEndRej` at `1(S)`.
  // `q_goEndRej` scans `1(S), 2(1), 3(0), 4(1)` keeping `S` / writing `#`? Wait: if `q_goEndRej` moves `R` leaving `1(S), 2(#), 3(#), 4(#)`, then `q_wipeRej` at `5(#)` skips `#`? No! If `q_goEndRej` leaves `S, X, 0, 1` unchanged (or turns everything to `X`) until `#(5)`, then from `5(#)` moving `L` in `q_wipeRej` hits `4(X) -> 3(X) -> 2(X) -> 1(X) -> 0(#)` -> `R` -> writes `Ⓝ, R -> qH`!
  // THAT'S 100% GAP-FREE!! Let's check `q_m0`/`q_m1` mismatch at index 5 in `#101#110#`:
  // Index 1 is `X`, 2 is `0`, 3 is `1`, 4 is `S`, 5 is `1`, 6 is `1`, 7 is `0`, 8 is `#`.
  // `q_m0`/`q_m1` writes `X` (not `#`!) when going to `q_goEndRej`, and `q_goEndRej` writes `X` for `S, 0, 1, X` while moving `R` to `8(#)`!
  // Then `q_wipeRej` moves `L` turning every `X` into `#` until `0(#)`, then `R`, writes `Ⓝ`, `R` → `qH`!
  // What about `q_m0`/`q_m1` hitting `8(#)` (`w2` shorter than `w1`)? All of `1..7` are `X, 0, 1, S` (NO `#` gaps!), so going straight to `q_wipeRej` (`L`) erases `7..1` cleanly to `#(0)`, `R`, writes `Ⓝ`, `R` → `qH`!
  // What about `q_w2E` (empty `w2`, e.g. `#101##` -> `0:#, 1:1, 2:0, 3:1, 4:#, 5:#`)?
  // `q0` at `5(#)` -> `L` -> `q_chkW2` at `4(#)` -> `L` -> `q_w2E` at `3(1)` -> erases `3, 2, 1` to `#` moving `L` until `0(#)`, `R` -> writes `Ⓝ`, `R` -> `qH`!

  // Patch transitions eq47..eq56 cleanly to match this gap-free invariant:
  transitions.splice(
    transitions.findIndex((t) => t.id === 'eq26'),
    2,
    makeRule('eq26', 'q_m0', '1', 'q_goEndRej', 'X', 'R'),
    makeRule('eq27', 'q_m0', '#', 'q_wipeRej', '#', 'L'),
  );
  transitions.splice(
    transitions.findIndex((t) => t.id === 'eq33'),
    2,
    makeRule('eq33', 'q_m1', '0', 'q_goEndRej', 'X', 'R'),
    makeRule('eq34', 'q_m1', '#', 'q_wipeRej', '#', 'L'),
  );
  transitions.splice(
    transitions.findIndex((t) => t.id === 'eq42'),
    2,
    makeRule('eq42', 'q_chkEnd', '0', 'q_goEndRej', 'X', 'R'),
    makeRule('eq43', 'q_chkEnd', '1', 'q_goEndRej', 'X', 'R'),
  );
  transitions.splice(
    transitions.findIndex((t) => t.id === 'eq47'),
    10,
    makeRule('eq47', 'q_goEndRej', 'S', 'q_goEndRej', 'X', 'R'),
    makeRule('eq48', 'q_goEndRej', '0', 'q_goEndRej', 'X', 'R'),
    makeRule('eq49', 'q_goEndRej', '1', 'q_goEndRej', 'X', 'R'),
    makeRule('eq50', 'q_goEndRej', 'X', 'q_goEndRej', 'X', 'R'),
    makeRule('eq51', 'q_goEndRej', '#', 'q_wipeRej', '#', 'L'),

    makeRule('eq52', 'q_wipeRej', '0', 'q_wipeRej', '#', 'L'),
    makeRule('eq53', 'q_wipeRej', '1', 'q_wipeRej', '#', 'L'),
    makeRule('eq54', 'q_wipeRej', 'X', 'q_wipeRej', '#', 'L'),
    makeRule('eq55', 'q_wipeRej', 'S', 'q_wipeRej', '#', 'L'),
    makeRule('eq56', 'q_wipeRej', '#', 'qH', 'Ⓝ', 'R'),
  );

  return {
    id: 'comp-binary-eq',
    name: 'Binary String Equality (w₁#w₂)',
    category: 'comparison',
    kind: 'decider',
    description:
      'Decides whether two # -separated binary strings are identical (w₁ = w₂), outputting #Ⓨ# or #Ⓝ#.',
    algorithmSummary:
      'Marks the separator # with S, then matches w₁ against w₂ bit-by-bit from left to right using X markers. Rejects on any bit mismatch or length difference after erasing all cells; accepts cleanly as #Ⓨ# when both strings exhaust together.',
    inputFormat: '#w₁#w₂# with w₁, w₂ ∈ {0, 1}* (e.g., #101#101#)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1'],
    tapeAlphabet: ['#', '0', '1', 'X', 'S', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states,
    transitions,
    sampleInputs: [
      { label: '101 = 101 (Accept)', input: '#101#101#', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      { label: '101 ≠ 110 (Reject)', input: '#101#110#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: '10 ≠ 101 (Reject)', input: '#10#101#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: '101 ≠ 10 (Reject)', input: '#101#10#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      { label: 'ε = ε (Accept)', input: '###', expectedOutput: '#Ⓨ#', verdict: 'accept' },
    ],
  };
}

export const COMPARISON_TEMPLATES: TuringMachineDefinition[] = [
  buildUnaryComparator(),
  buildBinaryEquality(),
];
