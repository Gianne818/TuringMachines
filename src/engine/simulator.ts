import type {
  ExecutionStep,
  SimulationStatus,
  SimulationTrace,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from './types';

export const DEFAULT_MAX_STEPS = 5000;

export function normalizeTapeInterior(rawInput: string, blankSymbol = '#'): string {
  const trimmed = rawInput.trim();
  if (trimmed === '' || trimmed === blankSymbol) {
    return '';
  }
  if (trimmed.startsWith(blankSymbol) && trimmed.endsWith(blankSymbol) && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith(blankSymbol)) {
    return trimmed.slice(1);
  }
  if (trimmed.endsWith(blankSymbol)) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

export function createInitialTapeState(
  rawInput: string,
  machine: Pick<TuringMachineDefinition, 'blankSymbol' | 'initialHead'>,
): {
  tape: Record<number, string>;
  head: number;
  minIndex: number;
  maxIndex: number;
  normalizedInput: string;
} {
  const blank = machine.blankSymbol || '#';
  const interior = normalizeTapeInterior(rawInput, blank);
  const tape: Record<number, string> = { 0: blank };

  for (let i = 0; i < interior.length; i += 1) {
    tape[i + 1] = interior[i];
  }
  const trailingIdx = interior.length + 1;
  tape[trailingIdx] = blank;

  let head = trailingIdx;
  if (machine.initialHead === 'leading-blank') {
    head = 0;
  } else if (machine.initialHead === 'first-symbol') {
    head = interior.length > 0 ? 1 : 0;
  }

  const normalizedInput = interior.length === 0 ? blank : `${blank}${interior}${blank}`;
  return {
    tape,
    head,
    minIndex: 0,
    maxIndex: trailingIdx,
    normalizedInput,
  };
}

export function readCell(tape: Record<number, string>, index: number, blankSymbol = '#'): string {
  return tape[index] ?? blankSymbol;
}

export function computeBounds(
  tape: Record<number, string>,
  head: number,
  prevMin: number,
  prevMax: number,
): { minIndex: number; maxIndex: number } {
  let minIndex = Math.min(prevMin, head - 1);
  let maxIndex = Math.max(prevMax, head + 1);
  for (const key of Object.keys(tape)) {
    const idx = Number(key);
    if (idx < minIndex) minIndex = idx;
    if (idx > maxIndex) maxIndex = idx;
  }
  return { minIndex, maxIndex };
}

export function formatInstantaneousDescription(
  tape: Record<number, string>,
  minIndex: number,
  maxIndex: number,
  head: number,
  state: string,
  blankSymbol = '#',
): string {
  // Trim excess leading/trailing blanks outside head and non-blank span while keeping 1 framing blank
  const keys = Object.keys(tape).map(Number);
  const nonBlanks = keys.filter((idx) => (tape[idx] ?? blankSymbol) !== blankSymbol);
  const spanMin = nonBlanks.length > 0 ? Math.min(...nonBlanks, head) : Math.min(head, 0);
  const spanMax = nonBlanks.length > 0 ? Math.max(...nonBlanks, head) : Math.max(head, 0);
  const lo = Math.max(minIndex, spanMin - 1);
  const hi = Math.min(maxIndex, spanMax + 1);

  let out = '';
  for (let i = lo; i <= hi; i += 1) {
    const sym = readCell(tape, i, blankSymbol);
    if (i === head) {
      out += `[${state}:${sym}]`;
    } else {
      out += sym;
    }
  }
  return out;
}

export function extractCanonicalOutput(
  tape: Record<number, string>,
  head: number,
  blankSymbol = '#',
): {
  rawWord: string;
  output: string;
  headAtCanonicalEnd: boolean;
} {
  const nonBlankIndices = Object.keys(tape)
    .map(Number)
    .filter((idx) => (tape[idx] ?? blankSymbol) !== blankSymbol);

  if (nonBlankIndices.length === 0) {
    return {
      rawWord: '',
      output: blankSymbol,
      headAtCanonicalEnd: readCell(tape, head, blankSymbol) === blankSymbol,
    };
  }

  const first = Math.min(...nonBlankIndices);
  const last = Math.max(...nonBlankIndices);
  let rawWord = '';
  for (let i = first; i <= last; i += 1) {
    rawWord += readCell(tape, i, blankSymbol);
  }

  const output = `${blankSymbol}${rawWord}${blankSymbol}`;
  const headAtCanonicalEnd =
    readCell(tape, head, blankSymbol) === blankSymbol && head === last + 1;

  return { rawWord, output, headAtCanonicalEnd };
}

export function buildTransitionLookup(
  transitions: TransitionRule[],
): Map<string, TransitionRule> {
  const lookup = new Map<string, TransitionRule>();
  for (const rule of transitions) {
    const key = `${rule.from}\0${rule.read}`;
    if (!lookup.has(key)) {
      lookup.set(key, rule);
    }
  }
  return lookup;
}

export function findTransition(
  lookup: Map<string, TransitionRule>,
  state: string,
  symbol: string,
): TransitionRule | undefined {
  return lookup.get(`${state}\0${symbol}`) ?? lookup.get(`${state}\0*`);
}

export function runSimulation(
  machine: TuringMachineDefinition,
  rawInput: string,
  maxSteps = DEFAULT_MAX_STEPS,
): SimulationTrace {
  const blank = machine.blankSymbol || '#';
  const stateMap = new Map<string, StateNode>();
  for (const s of machine.states) {
    stateMap.set(s.id, s);
  }
  const haltSet = new Set(machine.haltStates);
  const lookup = buildTransitionLookup(machine.transitions);

  const initial = createInitialTapeState(rawInput, machine);
  let currentTape: Record<number, string> = { ...initial.tape };
  let currentHead = initial.head;
  let currentState = machine.startState;
  let minIndex = initial.minIndex;
  let maxIndex = initial.maxIndex;

  const startNode = stateMap.get(currentState);
  const steps: ExecutionStep[] = [
    {
      step: 0,
      state: currentState,
      prevState: null,
      appliedRule: null,
      tape: { ...currentTape },
      minIndex,
      maxIndex,
      head: currentHead,
      writtenIndex: null,
      activeSchemaNodeId: startNode?.schemaNodeId,
      macroPath: startNode?.macroPath,
      idString: formatInstantaneousDescription(
        currentTape,
        minIndex,
        maxIndex,
        currentHead,
        currentState,
        blank,
      ),
    },
  ];

  let stepCount = 0;
  let hitStepLimit = false;

  while (!haltSet.has(currentState)) {
    if (stepCount >= maxSteps) {
      hitStepLimit = true;
      break;
    }

    const symbolUnderHead = readCell(currentTape, currentHead, blank);
    const rule = findTransition(lookup, currentState, symbolUnderHead);
    if (!rule) {
      break;
    }

    const nextTape: Record<number, string> = { ...currentTape };
    const writtenSymbol = rule.write === '*' ? symbolUnderHead : rule.write;
    const prevSymbol = readCell(currentTape, currentHead, blank);
    nextTape[currentHead] = writtenSymbol;
    const writtenIndex = writtenSymbol !== prevSymbol ? currentHead : null;

    let nextHead = currentHead;
    if (rule.move === 'L') {
      nextHead -= 1;
    } else if (rule.move === 'R') {
      nextHead += 1;
    }
    if (nextTape[nextHead] === undefined) {
      nextTape[nextHead] = blank;
    }

    const bounds = computeBounds(nextTape, nextHead, minIndex, maxIndex);
    minIndex = bounds.minIndex;
    maxIndex = bounds.maxIndex;

    const prevState = currentState;
    currentState = rule.to;
    currentTape = nextTape;
    currentHead = nextHead;
    stepCount += 1;

    const targetNode = stateMap.get(currentState);
    steps.push({
      step: stepCount,
      state: currentState,
      prevState,
      appliedRule: rule,
      tape: currentTape,
      minIndex,
      maxIndex,
      head: currentHead,
      writtenIndex,
      activeSchemaNodeId: targetNode?.schemaNodeId,
      macroPath: targetNode?.macroPath,
      idString: formatInstantaneousDescription(
        currentTape,
        minIndex,
        maxIndex,
        currentHead,
        currentState,
        blank,
      ),
    });
  }

  const { rawWord, output, headAtCanonicalEnd } = extractCanonicalOutput(
    currentTape,
    currentHead,
    blank,
  );

  let status: SimulationStatus = 'halted';
  if (hitStepLimit) {
    status = 'step-limit';
  } else if (machine.kind === 'decider') {
    if (rawWord === 'Ⓨ') {
      status = 'accepted';
    } else if (rawWord === 'Ⓝ') {
      status = 'rejected';
    }
  }

  return {
    steps,
    status,
    output,
    rawWord,
    headAtCanonicalEnd,
    totalSteps: steps.length - 1,
    normalizedInput: initial.normalizedInput,
  };
}
