import { autoLayoutStates } from './layout';
import type { Direction, StateNode, TransitionRule, TuringMachineDefinition } from './types';

export interface DSLParseResult {
  ok: boolean;
  errors: { line: number; message: string }[];
  transitions: TransitionRule[];
  states: StateNode[];
  startState: string;
  haltStates: string[];
  tapeAlphabet: string[];
}

export function serializeToDSL(machine: TuringMachineDefinition): string {
  const lines: string[] = [
    `// Turing Machine Rules for ${machine.name}`,
    `// Format: current_state, read_symbol -> next_state, write_symbol, move (L | R | S)`,
    `// Blank symbol: ${machine.blankSymbol}`,
    `start: ${machine.startState}`,
    `halt: ${machine.haltStates.join(', ')}`,
    '',
  ];

  for (const t of machine.transitions) {
    lines.push(`${t.from}, ${t.read} -> ${t.to}, ${t.write}, ${t.move}`);
  }

  return lines.join('\n');
}

export function parseFromDSL(
  dslText: string,
  baseMachine: TuringMachineDefinition,
): DSLParseResult {
  const errors: { line: number; message: string }[] = [];
  const transitions: TransitionRule[] = [];
  const seenPairs = new Map<string, number>();

  let startState = baseMachine.startState;
  let haltStates = [...baseMachine.haltStates];
  const discoveredStates = new Set<string>();

  const rawLines = dslText.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNum = i + 1;
    let line = rawLines[i].trim();

    // Strip // or ; comments
    const slashComment = line.indexOf('//');
    if (slashComment !== -1) line = line.slice(0, slashComment).trim();
    const semiComment = line.indexOf(';');
    if (semiComment !== -1) line = line.slice(0, semiComment).trim();

    if (!line) continue;

    if (/^start\s*:/i.test(line)) {
      const val = line.replace(/^start\s*:/i, '').trim();
      if (!val) {
        errors.push({ line: lineNum, message: 'Start state cannot be empty.' });
      } else {
        startState = val;
        discoveredStates.add(val);
      }
      continue;
    }

    if (/^halt\s*:/i.test(line)) {
      const vals = line
        .replace(/^halt\s*:/i, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      haltStates = vals;
      for (const v of vals) discoveredStates.add(v);
      continue;
    }

    const arrowMatch = line.match(/^(.+?)\s*(?:->|=>)\s*(.+)$/);
    if (!arrowMatch) {
      errors.push({
        line: lineNum,
        message: 'Expected "state, read -> nextState, write, L|R|S".',
      });
      continue;
    }

    const lhs = arrowMatch[1].split(',').map((s) => s.trim());
    const rhs = arrowMatch[2].split(',').map((s) => s.trim());

    if (lhs.length !== 2 || !lhs[0] || !lhs[1]) {
      errors.push({
        line: lineNum,
        message: 'Left side must be "state, read_symbol".',
      });
      continue;
    }
    if (rhs.length !== 3 || !rhs[0] || !rhs[1] || !rhs[2]) {
      errors.push({
        line: lineNum,
        message: 'Right side must be "nextState, write_symbol, L|R|S".',
      });
      continue;
    }

    const [from, read] = lhs;
    const [to, write, moveRaw] = rhs;
    const moveUpper = moveRaw.toUpperCase();

    if (read.length !== 1) {
      errors.push({
        line: lineNum,
        message: `Read symbol "${read}" must be a single character.`,
      });
      continue;
    }
    if (write.length !== 1) {
      errors.push({
        line: lineNum,
        message: `Write symbol "${write}" must be a single character.`,
      });
      continue;
    }
    if (moveUpper !== 'L' && moveUpper !== 'R' && moveUpper !== 'S') {
      errors.push({
        line: lineNum,
        message: `Invalid direction "${moveRaw}". Use L, R, or S.`,
      });
      continue;
    }

    const pairKey = `${from}\0${read}`;
    if (seenPairs.has(pairKey)) {
      errors.push({
        line: lineNum,
        message: `Duplicate deterministic transition for (${from}, ${read}) previously defined on line ${seenPairs.get(pairKey)}.`,
      });
      continue;
    }
    seenPairs.set(pairKey, lineNum);

    discoveredStates.add(from);
    discoveredStates.add(to);

    transitions.push({
      id: `dsl_${lineNum}_${from}_${read}`,
      from,
      read,
      to,
      write,
      move: moveUpper as Direction,
    });
  }

  if (!startState) {
    errors.push({ line: 1, message: 'A start state is required.' });
  } else {
    discoveredStates.add(startState);
  }
  for (const h of haltStates) discoveredStates.add(h);

  const existingStateMap = new Map(baseMachine.states.map((s) => [s.id, s]));
  const haltSet = new Set(haltStates);

  let states: StateNode[] = Array.from(discoveredStates).map((id) => {
    const prev = existingStateMap.get(id);
    return {
      id,
      label: prev?.label,
      x: prev?.x ?? 0,
      y: prev?.y ?? 0,
      isStart: id === startState,
      isHalt: haltSet.has(id),
    };
  });

  const needsLayout = states.some((s) => !existingStateMap.has(s.id));
  if (needsLayout) {
    states = autoLayoutStates(states, transitions, startState);
  }

  const alphabetSet = new Set<string>([baseMachine.blankSymbol, ...baseMachine.inputAlphabet]);
  for (const t of transitions) {
    if (t.read !== '*') alphabetSet.add(t.read);
    if (t.write !== '*') alphabetSet.add(t.write);
  }

  return {
    ok: errors.length === 0,
    errors,
    transitions,
    states,
    startState,
    haltStates,
    tapeAlphabet: Array.from(alphabetSet),
  };
}
