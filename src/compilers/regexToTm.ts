import { autoLayoutStates } from '../engine/layout';
import { runSimulation } from '../engine/simulator';
import type {
  SampleInput,
  SchemaDiagram,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TemplateCategory,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import type { CompileResult, RegularSpec } from './types';

type RegexAst =
  | { type: 'empty' }
  | { type: 'lit'; char: string }
  | { type: 'concat'; left: RegexAst; right: RegexAst }
  | { type: 'alt'; left: RegexAst; right: RegexAst }
  | { type: 'star'; inner: RegexAst }
  | { type: 'plus'; inner: RegexAst }
  | { type: 'opt'; inner: RegexAst };

type Token =
  | { kind: 'lit'; value: string; pos: number }
  | { kind: 'eps'; pos: number }
  | { kind: 'pipe'; pos: number }
  | { kind: 'star'; pos: number }
  | { kind: 'plus'; pos: number }
  | { kind: 'qmark'; pos: number }
  | { kind: 'lparen'; pos: number }
  | { kind: 'rparen'; pos: number };

const OPERATOR_CHARS = new Set(['|', '*', '+', '?', '(', ')']);
const FORBIDDEN_CHARS = new Set(['#', 'Ⓨ', 'Ⓝ']);

function isAlnum(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function tokenizeRegex(pattern: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (FORBIDDEN_CHARS.has(ch)) {
      return {
        ok: false,
        error: `Symbol '${ch}' is reserved by the Turing machine tape and cannot appear in the regular expression.`,
      };
    }

    if (ch === 'ε') {
      tokens.push({ kind: 'eps', pos: i });
      i += 1;
      continue;
    }

    if (pattern.slice(i, i + 3) === 'eps') {
      const prevOk = i === 0 || !isAlnum(pattern[i - 1]);
      const nextOk = i + 3 >= pattern.length || !isAlnum(pattern[i + 3]);
      if (prevOk && nextOk) {
        tokens.push({ kind: 'eps', pos: i });
        i += 3;
        continue;
      }
    }

    switch (ch) {
      case '|':
        tokens.push({ kind: 'pipe', pos: i });
        break;
      case '*':
        tokens.push({ kind: 'star', pos: i });
        break;
      case '+':
        tokens.push({ kind: 'plus', pos: i });
        break;
      case '?':
        tokens.push({ kind: 'qmark', pos: i });
        break;
      case '(':
        tokens.push({ kind: 'lparen', pos: i });
        break;
      case ')':
        tokens.push({ kind: 'rparen', pos: i });
        break;
      default: {
        const code = ch.charCodeAt(0);
        if (code < 0x21 || OPERATOR_CHARS.has(ch)) {
          return { ok: false, error: `Unsupported character '${ch}' at position ${i}.` };
        }
        tokens.push({ kind: 'lit', value: ch, pos: i });
        break;
      }
    }
    i += 1;
  }

  return { ok: true, tokens };
}

function parseRegex(pattern: string): { ok: true; ast: RegexAst; alphabet: string[] } | { ok: false; error: string } {
  if (!pattern || pattern.trim() === '') {
    return { ok: false, error: 'Regular expression cannot be empty. Use ε (or eps) for the empty string.' };
  }

  const tokRes = tokenizeRegex(pattern);
  if (!tokRes.ok) return tokRes;
  const tokens = tokRes.tokens;
  if (tokens.length === 0) {
    return { ok: false, error: 'Regular expression cannot be empty. Use ε (or eps) for the empty string.' };
  }

  let cursor = 0;
  const alphabetSet = new Set<string>();

  const peek = (): Token | undefined => tokens[cursor];
  const consume = (): Token => tokens[cursor++];

  function parseExpr(): RegexAst {
    let left = parseConcat();
    while (peek()?.kind === 'pipe') {
      const pipeTok = consume();
      const next = peek();
      if (!next || next.kind === 'pipe' || next.kind === 'rparen') {
        throw new Error(`Expected expression after '|' at position ${pipeTok.pos}.`);
      }
      const right = parseConcat();
      left = { type: 'alt', left, right };
    }
    return left;
  }

  function parseConcat(): RegexAst {
    const factors: RegexAst[] = [];
    while (true) {
      const t = peek();
      if (!t || t.kind === 'pipe' || t.kind === 'rparen') {
        break;
      }
      factors.push(parseFactor());
    }
    if (factors.length === 0) {
      const t = peek();
      throw new Error(
        t
          ? `Unexpected token '${t.kind === 'rparen' ? ')' : '|'}' at position ${t.pos}.`
          : 'Unexpected end of regular expression.',
      );
    }
    return factors.reduce((acc, cur) => ({ type: 'concat', left: acc, right: cur }));
  }

  function parseFactor(): RegexAst {
    const atom = parseAtom();
    const t = peek();
    if (t && (t.kind === 'star' || t.kind === 'plus' || t.kind === 'qmark')) {
      consume();
      const next = peek();
      if (next && (next.kind === 'star' || next.kind === 'plus' || next.kind === 'qmark')) {
        throw new Error(`Unexpected postfix operator at position ${next.pos}. Use parentheses to group operators.`);
      }
      if (t.kind === 'star') return { type: 'star', inner: atom };
      if (t.kind === 'plus') return { type: 'plus', inner: atom };
      return { type: 'opt', inner: atom };
    }
    return atom;
  }

  function parseAtom(): RegexAst {
    const t = peek();
    if (!t) {
      throw new Error('Unexpected end of regular expression.');
    }
    if (t.kind === 'lit') {
      consume();
      alphabetSet.add(t.value);
      return { type: 'lit', char: t.value };
    }
    if (t.kind === 'eps') {
      consume();
      return { type: 'empty' };
    }
    if (t.kind === 'lparen') {
      consume();
      if (peek()?.kind === 'rparen') {
        throw new Error(`Empty parentheses '()' at position ${t.pos}. Use '(ε)' for the empty string.`);
      }
      const inner = parseExpr();
      const close = peek();
      if (!close || close.kind !== 'rparen') {
        throw new Error(`Unmatched '(' at position ${t.pos}.`);
      }
      consume();
      return inner;
    }
    if (t.kind === 'rparen') {
      throw new Error(`Unmatched ')' at position ${t.pos}.`);
    }
    throw new Error(`Unexpected operator at position ${t.pos}.`);
  }

  try {
    const ast = parseExpr();
    if (cursor < tokens.length) {
      const leftover = tokens[cursor];
      if (leftover.kind === 'rparen') {
        throw new Error(`Unmatched ')' at position ${leftover.pos}.`);
      }
      throw new Error(`Unexpected token at position ${leftover.pos}.`);
    }
    const alphabet = Array.from(alphabetSet).sort();
    return { ok: true, ast, alphabet };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid regular expression.' };
  }
}

export interface Nfa {
  start: number;
  accept: Set<number>;
  alphabet: string[];
  eps: Map<number, number[]>;
  trans: Map<number, Map<string, number[]>>;
  numStates: number;
}

export interface Dfa {
  alphabet: string[];
  start: number;
  accept: Set<number>;
  /** transitions[state][symbol] = nextState (complete over alphabet) */
  transitions: Map<number, Map<string, number>>;
  numStates: number;
}

function buildThompsonNfa(ast: RegexAst, alphabet: string[]): Nfa {
  let nextId = 0;
  const eps = new Map<number, number[]>();
  const trans = new Map<number, Map<string, number[]>>();

  const newState = (): number => {
    const id = nextId++;
    eps.set(id, []);
    trans.set(id, new Map());
    return id;
  };

  const addEps = (from: number, to: number): void => {
    eps.get(from)!.push(to);
  };

  const addChar = (from: number, ch: string, to: number): void => {
    const map = trans.get(from)!;
    if (!map.has(ch)) map.set(ch, []);
    map.get(ch)!.push(to);
  };

  function compile(node: RegexAst): { start: number; end: number } {
    switch (node.type) {
      case 'empty': {
        const s = newState();
        const e = newState();
        addEps(s, e);
        return { start: s, end: e };
      }
      case 'lit': {
        const s = newState();
        const e = newState();
        addChar(s, node.char, e);
        return { start: s, end: e };
      }
      case 'concat': {
        const l = compile(node.left);
        const r = compile(node.right);
        addEps(l.end, r.start);
        return { start: l.start, end: r.end };
      }
      case 'alt': {
        const s = newState();
        const e = newState();
        const l = compile(node.left);
        const r = compile(node.right);
        addEps(s, l.start);
        addEps(s, r.start);
        addEps(l.end, e);
        addEps(r.end, e);
        return { start: s, end: e };
      }
      case 'star': {
        const s = newState();
        const e = newState();
        const inner = compile(node.inner);
        addEps(s, inner.start);
        addEps(s, e);
        addEps(inner.end, inner.start);
        addEps(inner.end, e);
        return { start: s, end: e };
      }
      case 'plus': {
        const s = newState();
        const e = newState();
        const inner = compile(node.inner);
        addEps(s, inner.start);
        addEps(inner.end, inner.start);
        addEps(inner.end, e);
        return { start: s, end: e };
      }
      case 'opt': {
        const s = newState();
        const e = newState();
        const inner = compile(node.inner);
        addEps(s, inner.start);
        addEps(s, e);
        addEps(inner.end, e);
        return { start: s, end: e };
      }
    }
  }

  const frag = compile(ast);
  return {
    start: frag.start,
    accept: new Set([frag.end]),
    alphabet,
    eps,
    trans,
    numStates: nextId,
  };
}

export function determinizeAndMinimize(nfa: Nfa): Dfa {
  const alphabet = nfa.alphabet;

  const epsClosure = (seeds: Iterable<number>): number[] => {
    const visited = new Set<number>(seeds);
    const stack = Array.from(visited);
    while (stack.length > 0) {
      const curr = stack.pop()!;
      for (const nxt of nfa.eps.get(curr) ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          stack.push(nxt);
        }
      }
    }
    return Array.from(visited).sort((a, b) => a - b);
  };

  const subsetKey = (subset: number[]): string => subset.join(',');

  const startSet = epsClosure([nfa.start]);
  const subsetToId = new Map<string, number>();
  const subsets: number[][] = [];
  const dfaTrans = new Map<number, Map<string, number>>();
  const dfaAccept = new Set<number>();

  const registerSubset = (subset: number[]): number => {
    const key = subsetKey(subset);
    const existing = subsetToId.get(key);
    if (existing !== undefined) return existing;
    const id = subsets.length;
    subsetToId.set(key, id);
    subsets.push(subset);
    dfaTrans.set(id, new Map());
    if (subset.some((s) => nfa.accept.has(s))) {
      dfaAccept.add(id);
    }
    return id;
  };

  const startId = registerSubset(startSet);
  const queue: number[] = [startId];

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currSet = subsets[currId];
    for (const sym of alphabet) {
      const moved = new Set<number>();
      for (const s of currSet) {
        const targets = nfa.trans.get(s)?.get(sym) ?? [];
        for (const t of targets) moved.add(t);
      }
      const nextSet = epsClosure(moved);
      const nextHad = subsetToId.has(subsetKey(nextSet));
      const nextId = registerSubset(nextSet);
      dfaTrans.get(currId)!.set(sym, nextId);
      if (!nextHad) queue.push(nextId);
    }
  }

  // Moore partition refinement minimization on reachable states
  const numReachable = subsets.length;
  const acceptGroup: number[] = [];
  const nonAcceptGroup: number[] = [];
  for (let s = 0; s < numReachable; s += 1) {
    if (dfaAccept.has(s)) acceptGroup.push(s);
    else nonAcceptGroup.push(s);
  }

  let partitions: number[][] = [];
  if (acceptGroup.length > 0) partitions.push(acceptGroup);
  if (nonAcceptGroup.length > 0) partitions.push(nonAcceptGroup);

  const stateToBlock = new Array<number>(numReachable);
  const assignBlocks = () => {
    partitions.forEach((blk, bIdx) => {
      for (const s of blk) stateToBlock[s] = bIdx;
    });
  };
  assignBlocks();

  let changed = true;
  while (changed) {
    changed = false;
    const nextPartitions: number[][] = [];
    for (const blk of partitions) {
      if (blk.length <= 1) {
        nextPartitions.push(blk);
        continue;
      }
      const buckets = new Map<string, number[]>();
      for (const s of blk) {
        const sig = alphabet.map((sym) => stateToBlock[dfaTrans.get(s)!.get(sym)!]).join('|');
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig)!.push(s);
      }
      if (buckets.size > 1) changed = true;
      for (const sub of buckets.values()) {
        nextPartitions.push(sub);
      }
    }
    partitions = nextPartitions;
    assignBlocks();
  }

  // Reorder minimized states in BFS order starting from start block
  const startBlock = stateToBlock[startId];
  const blockOrder: number[] = [startBlock];
  const seenBlocks = new Set<number>([startBlock]);
  for (let idx = 0; idx < blockOrder.length; idx += 1) {
    const blk = blockOrder[idx];
    const rep = partitions[blk][0];
    for (const sym of alphabet) {
      const targetBlk = stateToBlock[dfaTrans.get(rep)!.get(sym)!];
      if (!seenBlocks.has(targetBlk)) {
        seenBlocks.add(targetBlk);
        blockOrder.push(targetBlk);
      }
    }
  }

  const blockToNewId = new Map<number, number>();
  blockOrder.forEach((blk, newId) => blockToNewId.set(blk, newId));

  const minTrans = new Map<number, Map<string, number>>();
  const minAccept = new Set<number>();
  for (let newId = 0; newId < blockOrder.length; newId += 1) {
    const blk = blockOrder[newId];
    const rep = partitions[blk][0];
    if (dfaAccept.has(rep)) minAccept.add(newId);
    const row = new Map<string, number>();
    for (const sym of alphabet) {
      const targetBlk = stateToBlock[dfaTrans.get(rep)!.get(sym)!];
      row.set(sym, blockToNewId.get(targetBlk)!);
    }
    minTrans.set(newId, row);
  }

  return {
    alphabet,
    start: 0,
    accept: minAccept,
    transitions: minTrans,
    numStates: blockOrder.length,
  };
}

function isDeadDfaState(dfa: Dfa, state: number): boolean {
  if (dfa.accept.has(state)) return false;
  if (dfa.alphabet.length === 0) return true;
  const row = dfa.transitions.get(state)!;
  return dfa.alphabet.every((sym) => row.get(sym) === state);
}

function generateDfaSamples(
  dfa: Dfa,
  machine: TuringMachineDefinition,
): SampleInput[] {
  const acceptedWords: string[] = [];
  const rejectedWords: string[] = [];
  const visitCount = new Map<number, number>();
  const seenWords = new Set<string>();

  const queue: Array<{ state: number; word: string }> = [{ state: dfa.start, word: '' }];
  seenWords.add('');

  let pops = 0;
  const maxPops = 1200;

  while (queue.length > 0 && pops < maxPops && (acceptedWords.length < 3 || rejectedWords.length < 3)) {
    const { state, word } = queue.shift()!;
    pops += 1;

    if (dfa.accept.has(state)) {
      if (acceptedWords.length < 3) acceptedWords.push(word);
    } else if (rejectedWords.length < 3) {
      rejectedWords.push(word);
    }

    const visits = visitCount.get(state) ?? 0;
    if (visits >= 4) continue;
    visitCount.set(state, visits + 1);

    const row = dfa.transitions.get(state)!;
    for (const sym of dfa.alphabet) {
      const nextState = row.get(sym)!;
      const nextWord = word + sym;
      if (!seenWords.has(nextWord)) {
        seenWords.add(nextWord);
        queue.push({ state: nextState, word: nextWord });
      }
    }
  }

  const samples: SampleInput[] = [];
  for (const w of acceptedWords) {
    const tapeInput = w === '' ? '#' : `#${w}#`;
    const trace = runSimulation(machine, tapeInput, 5000);
    if (trace.status === 'accepted' && trace.headAtCanonicalEnd) {
      samples.push({
        label: w === '' ? 'Empty ε (Accept)' : `${w} (Accept)`,
        input: tapeInput,
        expectedOutput: '#Ⓨ#',
        verdict: 'accept',
      });
    }
  }
  for (const w of rejectedWords) {
    const tapeInput = w === '' ? '#' : `#${w}#`;
    const trace = runSimulation(machine, tapeInput, 5000);
    if (trace.status === 'rejected' && trace.headAtCanonicalEnd) {
      samples.push({
        label: w === '' ? 'Empty ε (Reject)' : `${w} (Reject)`,
        input: tapeInput,
        expectedOutput: '#Ⓝ#',
        verdict: 'reject',
      });
    }
  }

  return samples;
}

function buildDfaSchemaDiagram(
  dfa: Dfa,
  title: string,
  hasAccept: boolean,
  hasReject: boolean,
): SchemaDiagram {
  const sigma = dfa.alphabet;
  const colGap = 165;
  const rowGap = 112;

  // BFS column layering over DFA states
  const dfaCol = new Map<number, number>();
  const bfsQueue: number[] = [dfa.start];
  dfaCol.set(dfa.start, 0);
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()!;
    const curCol = dfaCol.get(cur)!;
    const row = dfa.transitions.get(cur)!;
    for (const sym of sigma) {
      const nxt = row.get(sym)!;
      if (!dfaCol.has(nxt)) {
        dfaCol.set(nxt, curCol + 1);
        bfsQueue.push(nxt);
      }
    }
  }
  for (let s = 0; s < dfa.numStates; s += 1) {
    if (!dfaCol.has(s)) dfaCol.set(s, s);
  }

  // Group into columns
  const columns = new Map<number, number[]>();
  for (let s = 0; s < dfa.numStates; s += 1) {
    const c = dfaCol.get(s)!;
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c)!.push(s);
  }

  // Group edges per (from, to) to compute max backward arc span
  const edgeGroups = new Map<string, { from: number; to: number; syms: string[] }>();
  for (let s = 0; s < dfa.numStates; s += 1) {
    const row = dfa.transitions.get(s)!;
    for (const sym of sigma) {
      const nxt = row.get(sym)!;
      const key = `${s}->${nxt}`;
      if (!edgeGroups.has(key)) edgeGroups.set(key, { from: s, to: nxt, syms: [] });
      edgeGroups.get(key)!.syms.push(sym);
    }
  }

  let maxBackSpan = 0;
  for (const g of edgeGroups.values()) {
    if (g.from === g.to) continue;
    const cFrom = dfaCol.get(g.from)!;
    const cTo = dfaCol.get(g.to)!;
    if (cFrom > cTo || edgeGroups.has(`${g.to}->${g.from}`)) {
      maxBackSpan = Math.max(maxBackSpan, Math.abs(cFrom - cTo));
    }
  }

  const maxRows = Math.max(1, ...Array.from(columns.values()).map((arr) => arr.length));
  const topDfaY = Math.max(130, 105 + Math.min(4, maxBackSpan) * 20);
  const centerY = topDfaY + ((maxRows - 1) * rowGap) / 2;
  const startX = 95;

  const dfaPos = new Map<number, { x: number; y: number }>();
  const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);
  for (const c of sortedCols) {
    const list = columns.get(c)!;
    const colTopY = centerY - ((list.length - 1) * rowGap) / 2;
    list.forEach((s, rIdx) => {
      const staggerX = list.length >= 3 && rIdx % 2 === 1 ? 30 : 0;
      dfaPos.set(s, {
        x: Math.round(startX + (c + 1) * colGap + staggerX),
        y: Math.round(colTopY + rIdx * rowGap),
      });
    });
  }

  const nodes: SchemaNode[] = [
    {
      id: 'n_rew',
      label: '> L_#',
      kind: 'start-action',
      builtinId: 'L_hash',
      x: startX,
      y: Math.round(dfaPos.get(dfa.start)?.y ?? centerY),
    },
  ];

  for (let s = 0; s < dfa.numStates; s += 1) {
    const pos = dfaPos.get(s)!;
    const dead = isDeadDfaState(dfa, s);
    nodes.push({
      id: `n_dfa_${s}`,
      label: sigma.length === 0 ? 'R' : '# R',
      sublabel: dead ? 'Sink' : undefined,
      kind: sigma.length === 0 ? 'move' : 'write',
      x: pos.x,
      y: pos.y,
    });
  }

  const maxDfaY = Math.max(...Array.from(dfaPos.values()).map((p) => p.y), topDfaY);
  const haltY = Math.round(maxDfaY + 125);

  const acceptXs: number[] = [];
  const rejectXs: number[] = [];
  for (let s = 0; s < dfa.numStates; s += 1) {
    const px = dfaPos.get(s)!.x;
    if (dfa.accept.has(s)) acceptXs.push(px);
    else rejectXs.push(px);
  }

  let acceptX =
    acceptXs.length > 0
      ? Math.round(acceptXs.reduce((a, b) => a + b, 0) / acceptXs.length)
      : startX + colGap;
  let rejectX =
    rejectXs.length > 0
      ? Math.round(rejectXs.reduce((a, b) => a + b, 0) / rejectXs.length)
      : startX + colGap * 2;

  if (hasAccept && hasReject && Math.abs(acceptX - rejectX) < 175) {
    const mid = Math.round((acceptX + rejectX) / 2);
    if (rejectX <= acceptX) {
      rejectX = Math.max(105, mid - 95);
      acceptX = rejectX + 190;
    } else {
      acceptX = Math.max(105, mid - 95);
      rejectX = acceptX + 190;
    }
  }

  if (hasAccept) {
    nodes.push({
      id: 'n_accept',
      label: 'Ⓨ R',
      kind: 'halt',
      variant: 'accept',
      x: acceptX,
      y: haltY,
    });
  }
  if (hasReject) {
    nodes.push({
      id: 'n_reject',
      label: 'Ⓝ R',
      kind: 'halt',
      variant: 'reject',
      x: rejectX,
      y: haltY,
    });
  }

  const edges: SchemaEdge[] = [
    {
      id: 'e_rew',
      from: 'n_rew',
      to: `n_dfa_${dfa.start}`,
      label: 'R',
    },
  ];

  let eid = 0;
  for (const g of edgeGroups.values()) {
    const label = g.syms.join(', ');
    if (g.from === g.to) {
      edges.push({
        id: `e_${eid++}`,
        from: `n_dfa_${g.from}`,
        to: `n_dfa_${g.to}`,
        label,
        isSelfLoop: true,
        loopAngleDeg: -90,
      });
      continue;
    }

    const fromPos = dfaPos.get(g.from)!;
    const toPos = dfaPos.get(g.to)!;
    const cFrom = dfaCol.get(g.from)!;
    const cTo = dfaCol.get(g.to)!;
    const hasRev = edgeGroups.has(`${g.to}->${g.from}`);
    const isBack = cFrom > cTo || (hasRev && cFrom === cTo && g.from > g.to);
    const skipsSameRow =
      cTo - cFrom > 1 && fromPos.y === toPos.y && fromPos.x !== toPos.x;

    let curveOffset = 0;
    if ((isBack || skipsSameRow) && fromPos.x !== toPos.x) {
      const span = Math.max(1, Math.abs(cFrom - cTo));
      curveOffset = -54 - Math.min(54, (span - 1) * 20);
    }

    edges.push({
      id: `e_${eid++}`,
      from: `n_dfa_${g.from}`,
      to: `n_dfa_${g.to}`,
      label,
      ...(curveOffset !== 0 ? { curveOffset } : {}),
    });
  }

  for (let s = 0; s < dfa.numStates; s += 1) {
    edges.push({
      id: `e_h_${s}`,
      from: `n_dfa_${s}`,
      to: dfa.accept.has(s) ? 'n_accept' : 'n_reject',
      label: '#',
    });
  }

  const maxX = Math.max(...nodes.map((n) => n.x), 360);
  return {
    title: `${title} — L&P Schema`,
    width: Math.max(520, maxX + 115),
    height: Math.max(290, haltY + 85),
    nodes,
    edges,
  };
}

export function compileDfaToTm(
  dfa: Dfa,
  opts: {
    id?: string;
    name: string;
    category?: TemplateCategory;
    description: string;
    algorithmSummary: string;
    inputFormat?: string;
  },
): TuringMachineDefinition {
  const sigma = dfa.alphabet;
  const hasAccept = dfa.accept.size > 0;
  const hasReject = dfa.accept.size < dfa.numStates;

  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_rew', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
  ];

  for (let s = 0; s < dfa.numStates; s += 1) {
    const acc = dfa.accept.has(s);
    const dead = isDeadDfaState(dfa, s);
    let label = `DFA ${s}`;
    if (s === dfa.start && acc) label = `q0 (✓)`;
    else if (s === dfa.start) label = `q0`;
    else if (dead) label = `Dead (${s})`;
    else if (acc) label = `q${s} (✓)`;

    states.push({ id: `q_dfa_${s}`, label, x: 0, y: 0, schemaNodeId: `n_dfa_${s}` });
  }

  const haltStates: string[] = [];
  if (hasAccept) {
    states.push({ id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' });
    haltStates.push('qH_acc');
  }
  if (hasReject) {
    states.push({ id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' });
    haltStates.push('qH_rej');
  }

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const addRule = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  // q0: step L from trailing # into rewind
  addRule('q0', '#', 'q_rew', '#', 'L');

  // q_rew: scan left over all Σ until leading #, then move R into start DFA state
  for (const sym of sigma) {
    addRule('q_rew', sym, 'q_rew', sym, 'L');
  }
  addRule('q_rew', '#', `q_dfa_${dfa.start}`, '#', 'R');

  // Each DFA state s: erase symbol as we scan L->R, output Ⓨ/Ⓝ at trailing #
  for (let s = 0; s < dfa.numStates; s += 1) {
    const fromId = `q_dfa_${s}`;
    const row = dfa.transitions.get(s)!;
    for (const sym of sigma) {
      const nxt = row.get(sym)!;
      addRule(fromId, sym, `q_dfa_${nxt}`, '#', 'R');
    }
    const acc = dfa.accept.has(s);
    addRule(fromId, '#', acc ? 'qH_acc' : 'qH_rej', acc ? 'Ⓨ' : 'Ⓝ', 'R');
  }

  const laidOutStates = autoLayoutStates(states, transitions, 'q0', {
    colGap: 185,
    rowGap: 120,
  });

  const machine: TuringMachineDefinition = {
    id: opts.id ?? 'compiled-dfa-tm',
    name: opts.name,
    category: opts.category ?? 'regular',
    kind: 'decider',
    description: opts.description,
    algorithmSummary: opts.algorithmSummary,
    inputFormat:
      opts.inputFormat ??
      (sigma.length > 0 ? `#w# with w ∈ {${sigma.join(', ')}}*` : '# (empty string ε only)'),
    blankSymbol: '#',
    inputAlphabet: sigma,
    tapeAlphabet: ['#', ...sigma, 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates,
    states: laidOutStates,
    transitions,
    schemaDiagram: buildDfaSchemaDiagram(dfa, opts.name, hasAccept, hasReject),
    sampleInputs: [],
    isCustom: true,
  };

  machine.sampleInputs = generateDfaSamples(dfa, machine);
  return machine;
}

export function compileRegexToTm(spec: RegularSpec): CompileResult {
  const parsed = parseRegex(spec.pattern);
  if (!parsed.ok) {
    return parsed;
  }

  const nfa = buildThompsonNfa(parsed.ast, parsed.alphabet);
  const dfa = determinizeAndMinimize(nfa);

  const trimmed = spec.pattern.trim();
  const machine = compileDfaToTm(dfa, {
    id: `compiled-regex-${Date.now().toString(36)}`,
    name: `Regex Decider: ${trimmed}`,
    category: 'regular',
    description: `Decides the regular language L(${trimmed}) over Σ = {${parsed.alphabet.join(', ')}} using a minimized ${dfa.numStates}-state DFA compiled into a canonical L&P decider.`,
    algorithmSummary: `Thompson NFA (${nfa.numStates} states) → Subset Construction → Moore-minimized ${dfa.numStates}-state DFA. The TM rewinds from the trailing # to the start of w, simulates the minimized DFA left-to-right while erasing each symbol to #, and writes Ⓨ or Ⓝ at the trailing # before stepping right to Halt.`,
  });

  return {
    ok: true,
    machine,
    notes: `Minimized DFA has ${dfa.numStates} state${dfa.numStates === 1 ? '' : 's'} over Σ = {${parsed.alphabet.join(', ')}}.`,
  };
}
