import { autoLayoutStates } from '../engine/layout';
import { runSimulation } from '../engine/simulator';
import type {
  SampleInput,
  SchemaDiagram,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import { compileDfaToTm, determinizeAndMinimize, type Nfa } from './regexToTm';
import type { CompileResult, ContextFreeSpec } from './types';

interface Production {
  lhs: string;
  rhs: string[]; // symbols: [A-Z] = nonterminal, anything else = terminal; [] = epsilon
}

interface ParsedGrammar {
  startSymbol: string;
  nonTerminals: string[];
  terminals: string[];
  productions: Production[];
}

const RESERVED_SYMBOLS = new Set(['#', '|', ';', 'Ⓨ', 'Ⓝ']);

function isNonTerminal(sym: string): boolean {
  return /^[A-Z]$/.test(sym);
}

function parseRhsAlt(raw: string): { ok: true; rhs: string[] } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty alternative in production (use 'ε' or 'eps' for empty string)." };
  }
  if (trimmed === 'ε' || trimmed === 'eps') {
    return { ok: true, rhs: [] };
  }

  const rhs: string[] = [];
  const chunks = trimmed.split(/\s+/);
  for (const chunk of chunks) {
    if (chunk === 'ε' || chunk === 'eps') {
      continue;
    }
    for (const ch of chunk) {
      if (ch === 'ε') continue;
      if (RESERVED_SYMBOLS.has(ch)) {
        return {
          ok: false,
          error: `Reserved symbol '${ch}' cannot appear in CFG productions.`,
        };
      }
      rhs.push(ch);
    }
  }
  return { ok: true, rhs };
}

function parseCfg(grammarText: string): { ok: true; grammar: ParsedGrammar } | { ok: false; error: string } {
  if (!grammarText || grammarText.trim() === '') {
    return { ok: false, error: 'Grammar cannot be empty. Enter rules like: S -> a S b | a b' };
  }

  // Split by newlines or ';'
  const rawLines = grammarText
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));

  if (rawLines.length === 0) {
    return { ok: false, error: 'No grammar rules found.' };
  }

  const productions: Production[] = [];
  let startSymbol: string | null = null;
  let currentLhs: string | null = null;

  for (const line of rawLines) {
    let lhs: string;
    let rhsText: string;

    if (line.startsWith('|')) {
      if (!currentLhs) {
        return { ok: false, error: `Leading '|' without a preceding rule: '${line}'.` };
      }
      lhs = currentLhs;
      rhsText = line.slice(1);
    } else {
      const arrowMatch = line.match(/^(.*?)\s*(?:->|→)\s*(.*)$/);
      if (!arrowMatch) {
        return {
          ok: false,
          error: `Invalid rule syntax '${line}'. Expected 'A -> α | β' (using '->' or '→').`,
        };
      }
      lhs = arrowMatch[1].trim();
      rhsText = arrowMatch[2];
      if (!isNonTerminal(lhs)) {
        return {
          ok: false,
          error: `Invalid left-hand side '${lhs}'. Nonterminals must be single uppercase letters (A–Z).`,
        };
      }
      currentLhs = lhs;
      if (startSymbol === null) startSymbol = lhs;
    }

    const alts = rhsText.split('|');
    for (const alt of alts) {
      const parsedAlt = parseRhsAlt(alt);
      if (!parsedAlt.ok) {
        return { ok: false, error: `In rule for ${lhs}: ${parsedAlt.error}` };
      }
      productions.push({ lhs, rhs: parsedAlt.rhs });
    }
  }

  if (!startSymbol || productions.length === 0) {
    return { ok: false, error: 'Grammar must define at least one valid production.' };
  }

  const ntSet = new Set<string>([startSymbol]);
  const termSet = new Set<string>();
  for (const p of productions) {
    ntSet.add(p.lhs);
    for (const s of p.rhs) {
      if (isNonTerminal(s)) ntSet.add(s);
      else termSet.add(s);
    }
  }

  const nonTerminals = [
    startSymbol,
    ...Array.from(ntSet)
      .filter((nt) => nt !== startSymbol)
      .sort(),
  ];
  const terminals = Array.from(termSet).sort();

  return {
    ok: true,
    grammar: {
      startSymbol,
      nonTerminals,
      terminals,
      productions,
    },
  };
}

// ============================================================================
// Shared Grammar Normalization + CYK Membership Checker
// ============================================================================

function eliminateEpsilonAndUnitProductions(grammar: ParsedGrammar): {
  acceptsEmpty: boolean;
  unitFree: Production[];
} {
  // 1. Nullable nonterminals
  const nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of grammar.productions) {
      if (!nullable.has(p.lhs) && p.rhs.every((s) => isNonTerminal(s) && nullable.has(s))) {
        nullable.add(p.lhs);
        changed = true;
      }
    }
  }
  const acceptsEmpty = nullable.has(grammar.startSymbol);

  // 2. Eliminate epsilon productions
  const noEps: Production[] = [];
  const seenKey = new Set<string>();
  for (const p of grammar.productions) {
    if (p.rhs.length === 0) continue;
    const nullableIndices: number[] = [];
    p.rhs.forEach((s, idx) => {
      if (isNonTerminal(s) && nullable.has(s)) nullableIndices.push(idx);
    });
    const combos = 1 << Math.min(nullableIndices.length, 16);
    for (let mask = 0; mask < combos; mask += 1) {
      const drop = new Set<number>();
      for (let bit = 0; bit < nullableIndices.length; bit += 1) {
        if ((mask & (1 << bit)) !== 0) drop.add(nullableIndices[bit]);
      }
      const nextRhs = p.rhs.filter((_, idx) => !drop.has(idx));
      if (nextRhs.length === 0) continue;
      const key = `${p.lhs}->${nextRhs.join('\0')}`;
      if (!seenKey.has(key)) {
        seenKey.add(key);
        noEps.push({ lhs: p.lhs, rhs: nextRhs });
      }
    }
  }

  // 3. Eliminate unit productions A -> B
  const unitEdges = new Map<string, Set<string>>();
  for (const nt of grammar.nonTerminals) unitEdges.set(nt, new Set([nt]));
  for (const p of noEps) {
    if (p.rhs.length === 1 && isNonTerminal(p.rhs[0])) {
      unitEdges.get(p.lhs)?.add(p.rhs[0]);
    }
  }
  let unitChanged = true;
  while (unitChanged) {
    unitChanged = false;
    for (const [, reach] of unitEdges.entries()) {
      for (const b of Array.from(reach)) {
        for (const c of unitEdges.get(b) ?? []) {
          if (!reach.has(c)) {
            reach.add(c);
            unitChanged = true;
          }
        }
      }
    }
  }

  const unitFree: Production[] = [];
  const ufSeen = new Set<string>();
  for (const a of grammar.nonTerminals) {
    for (const b of unitEdges.get(a) ?? []) {
      for (const p of noEps) {
        if (p.lhs !== b) continue;
        if (p.rhs.length === 1 && isNonTerminal(p.rhs[0])) continue;
        const key = `${a}->${p.rhs.join('\0')}`;
        if (!ufSeen.has(key)) {
          ufSeen.add(key);
          unitFree.push({ lhs: a, rhs: p.rhs });
        }
      }
    }
  }

  return { acceptsEmpty, unitFree };
}

function buildCykChecker(grammar: ParsedGrammar): (word: string) => boolean {
  const { acceptsEmpty, unitFree } = eliminateEpsilonAndUnitProductions(grammar);

  // Convert to CNF (A -> terminal, A -> B C)
  const termRules = new Map<string, string[]>(); // terminal -> LHS[]
  const binRules: Array<{ lhs: string; b: string; c: string }> = [];
  let helperId = 0;
  const termWrapper = new Map<string, string>();
  const getTermWrapper = (t: string): string => {
    if (termWrapper.has(t)) return termWrapper.get(t)!;
    const nt = `_T${helperId++}`;
    termWrapper.set(t, nt);
    if (!termRules.has(t)) termRules.set(t, []);
    termRules.get(t)!.push(nt);
    return nt;
  };

  for (const p of unitFree) {
    if (p.rhs.length === 1) {
      const t = p.rhs[0];
      if (!isNonTerminal(t)) {
        if (!termRules.has(t)) termRules.set(t, []);
        termRules.get(t)!.push(p.lhs);
      }
      continue;
    }
    const syms = p.rhs.map((s) => (isNonTerminal(s) ? s : getTermWrapper(s)));
    let curLhs = p.lhs;
    for (let i = 0; i < syms.length - 2; i += 1) {
      const nextHelper = `_B${helperId++}`;
      binRules.push({ lhs: curLhs, b: syms[i], c: nextHelper });
      curLhs = nextHelper;
    }
    binRules.push({
      lhs: curLhs,
      b: syms[syms.length - 2],
      c: syms[syms.length - 1],
    });
  }

  return (word: string): boolean => {
    if (word.length === 0) return acceptsEmpty;
    const n = word.length;
    const table: Array<Array<Set<string>>> = Array.from({ length: n }, () =>
      Array.from({ length: n + 1 }, () => new Set<string>()),
    );

    for (let i = 0; i < n; i += 1) {
      const ch = word[i];
      for (const lhs of termRules.get(ch) ?? []) {
        table[i][1].add(lhs);
      }
    }

    for (let len = 2; len <= n; len += 1) {
      for (let i = 0; i <= n - len; i += 1) {
        const cell = table[i][len];
        for (let split = 1; split < len; split += 1) {
          const left = table[i][split];
          const right = table[i + split][len - split];
          if (left.size === 0 || right.size === 0) continue;
          for (const rule of binRules) {
            if (left.has(rule.b) && right.has(rule.c)) {
              cell.add(rule.lhs);
            }
          }
        }
      }
    }

    return table[0][n].has(grammar.startSymbol);
  };
}

// ============================================================================
// Tier 1: Right-Linear Grammar -> NFA -> DFA -> TM
// ============================================================================

function isRightLinear(grammar: ParsedGrammar): boolean {
  return grammar.productions.every((p) => {
    if (p.rhs.length === 0) return true;
    for (let i = 0; i < p.rhs.length - 1; i += 1) {
      if (isNonTerminal(p.rhs[i])) return false;
    }
    return true; // last symbol may be terminal or nonterminal
  });
}

function compileTier1RightLinear(grammar: ParsedGrammar): CompileResult {
  let nextId = 0;
  const eps = new Map<number, number[]>();
  const trans = new Map<number, Map<string, number[]>>();
  const newState = (): number => {
    const id = nextId++;
    eps.set(id, []);
    trans.set(id, new Map());
    return id;
  };
  const addEps = (from: number, to: number) => eps.get(from)!.push(to);
  const addChar = (from: number, ch: string, to: number) => {
    const m = trans.get(from)!;
    if (!m.has(ch)) m.set(ch, []);
    m.get(ch)!.push(to);
  };

  const ntState = new Map<string, number>();
  for (const nt of grammar.nonTerminals) {
    ntState.set(nt, newState());
  }
  const acceptState = newState();

  for (const p of grammar.productions) {
    const from = ntState.get(p.lhs)!;
    const last = p.rhs[p.rhs.length - 1];
    const hasTrailingNt = p.rhs.length > 0 && isNonTerminal(last);
    const termPrefix = hasTrailingNt ? p.rhs.slice(0, -1) : p.rhs;
    const target = hasTrailingNt ? ntState.get(last)! : acceptState;

    if (termPrefix.length === 0) {
      addEps(from, target);
    } else {
      let cur = from;
      for (let i = 0; i < termPrefix.length - 1; i += 1) {
        const mid = newState();
        addChar(cur, termPrefix[i], mid);
        cur = mid;
      }
      addChar(cur, termPrefix[termPrefix.length - 1], target);
    }
  }

  const nfa: Nfa = {
    start: ntState.get(grammar.startSymbol)!,
    accept: new Set([acceptState]),
    alphabet: grammar.terminals,
    eps,
    trans,
    numStates: nextId,
  };

  const dfa = determinizeAndMinimize(nfa);
  const machine = compileDfaToTm(dfa, {
    id: `compiled-cfg-reg-${Date.now().toString(36)}`,
    name: 'CFG Decider (Regular / Right-Linear)',
    category: 'context-free',
    description: `Right-linear CFG recognized as a regular language over Σ = {${grammar.terminals.join(', ')}} and compiled via minimal ${dfa.numStates}-state DFA.`,
    algorithmSummary: `Tier 1 detection: all productions have the right-linear form A → w or A → wB. Converted directly to an NFA (${nfa.numStates} states), determinized and minimized to ${dfa.numStates} DFA states, and compiled into a single-pass L&P decider.`,
  });

  return {
    ok: true,
    machine,
    notes: `Tier 1 (Right-Linear Grammar): compiled to minimal ${dfa.numStates}-state DFA decider.`,
  };
}

// ============================================================================
// Tier 2: Exact Parametric CFL Builders
// ============================================================================

function finalizeTm(
  idPrefix: string,
  name: string,
  description: string,
  algorithmSummary: string,
  sigma: string[],
  extraTape: string[],
  states: StateNode[],
  transitions: TransitionRule[],
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
  schemaDiagram: SchemaDiagram,
): CompileResult {
  const laidOut = autoLayoutStates(states, transitions, 'q0', {
    colGap: 185,
    rowGap: 115,
  });
  const haltStates = states.filter((s) => s.isHalt).map((s) => s.id);

  const machine: TuringMachineDefinition = {
    id: `${idPrefix}-${Date.now().toString(36)}`,
    name,
    category: 'context-free',
    kind: 'decider',
    description,
    algorithmSummary,
    inputFormat:
      sigma.length > 0 ? `#w# with w ∈ {${sigma.join(', ')}}*` : '# (empty string ε only)',
    blankSymbol: '#',
    inputAlphabet: sigma,
    tapeAlphabet: Array.from(new Set(['#', ...sigma, ...extraTape, 'Ⓨ', 'Ⓝ'])),
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates,
    states: laidOut,
    transitions,
    schemaDiagram,
    sampleInputs: [],
    isCustom: true,
  };

  const { samples, warning } = verifyAndCollectSamples(grammar, machine, cykAccepts);
  machine.sampleInputs = samples;
  return {
    ok: true,
    machine,
    warning,
  };
}

function generateGrammarDerivations(grammar: ParsedGrammar, maxWords = 24): string[] {
  const byLhs = new Map<string, string[][]>();
  for (const p of grammar.productions) {
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p.rhs);
  }

  const forms: Array<string[]> = [[grammar.startSymbol]];
  const seenForms = new Set<string>([grammar.startSymbol]);
  const words: string[] = [];
  const seenWords = new Set<string>();

  let idx = 0;
  while (idx < forms.length && words.length < maxWords && forms.length < 350) {
    const form = forms[idx++];
    const ntPos = form.findIndex(isNonTerminal);
    if (ntPos === -1) {
      const w = form.join('');
      if (!seenWords.has(w)) {
        seenWords.add(w);
        words.push(w);
      }
      continue;
    }
    const nt = form[ntPos];
    for (const rhs of byLhs.get(nt) ?? []) {
      const next = [...form.slice(0, ntPos), ...rhs, ...form.slice(ntPos + 1)];
      if (next.length > 10) continue;
      const key = next.join('\0');
      if (!seenForms.has(key)) {
        seenForms.add(key);
        forms.push(next);
      }
    }
  }
  return words;
}

function verifyAndCollectSamples(
  grammar: ParsedGrammar,
  machine: TuringMachineDefinition,
  cykAccepts: (w: string) => boolean,
): { samples: SampleInput[]; warning?: string } {
  const sigma = grammar.terminals;
  const candidateWords: string[] = [''];
  const seen = new Set<string>(['']);

  // Breadth-first enumerate short strings over Σ up to length 6 (max 360 strings)
  let qIdx = 0;
  while (qIdx < candidateWords.length && candidateWords.length < 360) {
    const cur = candidateWords[qIdx++];
    if (cur.length >= 6) continue;
    for (const ch of sigma) {
      const nxt = cur + ch;
      if (!seen.has(nxt)) {
        seen.add(nxt);
        candidateWords.push(nxt);
        if (candidateWords.length >= 360) break;
      }
    }
  }

  // Ensure derived accepted words up to length 10 are also sampled
  for (const w of generateGrammarDerivations(grammar, 20)) {
    if (!seen.has(w)) {
      seen.add(w);
      candidateWords.push(w);
    }
  }

  const acceptedSamples: SampleInput[] = [];
  const rejectedSamples: SampleInput[] = [];
  let mismatchNote: string | undefined;

  for (const w of candidateWords) {
    const expectedAccept = cykAccepts(w);
    const tapeInput = w === '' ? '#' : `#${w}#`;
    const trace = runSimulation(machine, tapeInput, 8000);
    const tmAccept = trace.status === 'accepted';
    const tmReject = trace.status === 'rejected';

    if ((tmAccept || tmReject) && trace.headAtCanonicalEnd) {
      if (tmAccept !== expectedAccept && !mismatchNote) {
        const display = w === '' ? 'ε' : w;
        mismatchNote =
          `Greedy left-to-right bottom-up reduction diverged on '${display}' ` +
          `(CYK membership: ${expectedAccept ? 'accept' : 'reject'}, ` +
          `greedy TM output: ${tmAccept ? '#Ⓨ#' : '#Ⓝ#'}). ` +
          `Ambiguous or right-recursive grammars may require backtracking/lookahead.`;
      }

      if (expectedAccept && tmAccept && acceptedSamples.length < 3) {
        acceptedSamples.push({
          label: w === '' ? 'Empty ε (Accept)' : `${w} (Accept)`,
          input: tapeInput,
          expectedOutput: '#Ⓨ#',
          verdict: 'accept',
        });
      } else if (!expectedAccept && tmReject && rejectedSamples.length < 3) {
        rejectedSamples.push({
          label: w === '' ? 'Empty ε (Reject)' : `${w} (Reject)`,
          input: tapeInput,
          expectedOutput: '#Ⓝ#',
          verdict: 'reject',
        });
      }
    } else if (!mismatchNote && trace.status === 'step-limit') {
      mismatchNote = `Simulation exceeded step limit on '${w || 'ε'}'.`;
    }

    if (acceptedSamples.length >= 3 && rejectedSamples.length >= 3 && mismatchNote) {
      break;
    }
  }

  return {
    samples: [...acceptedSamples, ...rejectedSamples],
    warning: mismatchNote,
  };
}

function tryBuildMatchedPowers(
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
): CompileResult | null {
  if (grammar.nonTerminals.length !== 1) return null;
  const S = grammar.startSymbol;
  const prods = grammar.productions;

  const rec = prods.filter((p) => p.rhs.includes(S));
  const base = prods.filter((p) => !p.rhs.includes(S));
  if (rec.length !== 1 || base.length === 0) return null;

  const r = rec[0].rhs;
  const sIdx = r.indexOf(S);
  if (sIdx <= 0 || sIdx >= r.length - 1 || r.indexOf(S, sIdx + 1) !== -1) {
    return null;
  }

  const left = r.slice(0, sIdx);
  const right = r.slice(sIdx + 1);
  if (left.length === 0 || right.length === 0 || left.length > 4 || right.length > 4) {
    return null;
  }

  const x = left[0];
  const y = right[0];
  if (x === y || !left.every((c) => c === x) || !right.every((c) => c === y)) {
    return null;
  }
  const p = left.length;
  const q = right.length;

  let minN: 0 | 1 = 1;
  let center: string | null = null;
  let hasEmptyBase = false;
  let hasSingleCenter = false;

  for (const b of base) {
    const rhs = b.rhs;
    if (rhs.length === 0) {
      hasEmptyBase = true;
      minN = 0;
    } else if (rhs.length === 1 && rhs[0] !== x && rhs[0] !== y) {
      if (center !== null && center !== rhs[0]) return null;
      center = rhs[0];
      hasSingleCenter = true;
      minN = 0;
    } else if (
      rhs.length === p + q &&
      rhs.slice(0, p).every((c) => c === x) &&
      rhs.slice(p).every((c) => c === y)
    ) {
      // Base case x^p y^q
    } else if (
      rhs.length === p + 1 + q &&
      rhs.slice(0, p).every((c) => c === x) &&
      rhs[p] !== x &&
      rhs[p] !== y &&
      rhs.slice(p + 1).every((c) => c === y)
    ) {
      if (center !== null && center !== rhs[p]) return null;
      center = rhs[p];
    } else {
      return null;
    }
  }

  // Disallow mixed center/no-center bases like `ε | c` or `ab | acb`
  if (hasEmptyBase && center !== null) return null;
  if (center !== null && !hasSingleCenter && minN === 0) return null;
  if (
    center !== null &&
    base.some((b) => b.rhs.length === p + q)
  ) {
    return null;
  }

  const sigma = grammar.terminals;
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_init', label: 'Check empty', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_rew_init', label: 'To start ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_L_opt_0', label: `Peel ${x}`, x: 0, y: 0, schemaNodeId: 'n_peelL' },
    { id: 'q_seek_R', label: 'Seek right →', x: 0, y: 0, schemaNodeId: 'n_seekR' },
    { id: 'q_seek_L', label: 'Seek left ←', x: 0, y: 0, schemaNodeId: 'n_seekL' },
    { id: 'q_wipe_R_rej', label: 'Wipe → (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipeRej' },
    { id: 'q_wipe_L_rej', label: 'Wipe ← (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipeRej' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];
  if (minN === 1) states.push({ id: 'q_L_req_0', label: `First ${x}`, x: 0, y: 0, schemaNodeId: 'n_peelL' });
  if (center !== null) states.push({ id: 'q_after_center', label: `After ${center}`, x: 0, y: 0, schemaNodeId: 'n_peelL' });
  for (let i = 1; i < p; i += 1) {
    states.push({ id: `q_L_${i}`, label: `Peel ${x} (${i + 1}/${p})`, x: 0, y: 0, schemaNodeId: 'n_peelL' });
  }
  for (let j = 0; j < q; j += 1) {
    states.push({ id: `q_R_${j}`, label: `Peel ${y} (${j + 1}/${q})`, x: 0, y: 0, schemaNodeId: 'n_peelR' });
  }

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  add('q0', '#', 'q_init', '#', 'L');
  add('q_init', '#', minN === 0 && center === null ? 'qH_acc' : 'qH_rej', minN === 0 && center === null ? 'Ⓨ' : 'Ⓝ', 'R');
  for (const s of sigma) {
    add('q_init', s, 'q_rew_init', s, 'L');
    add('q_rew_init', s, 'q_rew_init', s, 'L');
  }
  add('q_rew_init', '#', minN === 1 ? 'q_L_req_0' : 'q_L_opt_0', '#', 'R');

  const firstLeftTarget = p > 1 ? 'q_L_1' : 'q_seek_R';
  if (minN === 1) {
    add('q_L_req_0', x, firstLeftTarget, '#', 'R');
    add('q_L_req_0', '#', 'qH_rej', 'Ⓝ', 'R');
    for (const s of sigma) {
      if (s !== x) add('q_L_req_0', s, 'q_wipe_R_rej', '#', 'R');
    }
  }

  add('q_L_opt_0', '#', center === null ? 'qH_acc' : 'qH_rej', center === null ? 'Ⓨ' : 'Ⓝ', 'R');
  add('q_L_opt_0', x, firstLeftTarget, '#', 'R');
  if (center !== null) {
    add('q_L_opt_0', center, 'q_after_center', '#', 'R');
    add('q_after_center', '#', 'qH_acc', 'Ⓨ', 'R');
    for (const s of sigma) {
      add('q_after_center', s, 'q_wipe_R_rej', '#', 'R');
    }
  }
  for (const s of sigma) {
    if (s !== x && s !== center) {
      add('q_L_opt_0', s, 'q_wipe_R_rej', '#', 'R');
    }
  }

  for (let i = 1; i < p; i += 1) {
    const state = `q_L_${i}`;
    const nextState = i + 1 < p ? `q_L_${i + 1}` : 'q_seek_R';
    add(state, x, nextState, '#', 'R');
    add(state, '#', 'qH_rej', 'Ⓝ', 'R');
    for (const s of sigma) {
      if (s !== x) add(state, s, 'q_wipe_R_rej', '#', 'R');
    }
  }

  for (const s of sigma) add('q_seek_R', s, 'q_seek_R', s, 'R');
  add('q_seek_R', '#', 'q_R_0', '#', 'L');

  for (let j = 0; j < q; j += 1) {
    const state = `q_R_${j}`;
    const nextState = j + 1 < q ? `q_R_${j + 1}` : 'q_seek_L';
    add(state, y, nextState, '#', 'L');
    add(state, '#', 'qH_rej', 'Ⓝ', 'R');
    for (const s of sigma) {
      if (s !== y) add(state, s, 'q_wipe_L_rej', '#', 'L');
    }
  }

  for (const s of sigma) add('q_seek_L', s, 'q_seek_L', s, 'L');
  add('q_seek_L', '#', 'q_L_opt_0', '#', 'R');

  for (const s of sigma) {
    add('q_wipe_R_rej', s, 'q_wipe_R_rej', '#', 'R');
    add('q_wipe_L_rej', s, 'q_wipe_L_rej', '#', 'L');
  }
  add('q_wipe_R_rej', '#', 'qH_rej', 'Ⓝ', 'R');
  add('q_wipe_L_rej', '#', 'qH_rej', 'Ⓝ', 'R');

  const descRatio = `${p === 1 ? '' : p}n` + (q === 1 ? 'n' : `${q}n`);
  const centerStr = center ? center : '';
  const langStr = `${x}^${p === 1 ? 'n' : `${p}n`}${centerStr}${y}^${q === 1 ? 'n' : `${q}n`} (n ≥ ${minN})`;
  const acceptsEmpty = minN === 0 && center === null;

  const schemaDiagram: SchemaDiagram = {
    title: `CFG Decider: ${langStr} — L&P Schema`,
    width: 740,
    height: 455,
    nodes: [
      { id: 'n_accept', label: 'Ⓨ R', kind: 'halt', variant: 'accept', x: 185, y: 80 },
      { id: 'n_seekL', label: 'L_# R', kind: 'builtin', builtinId: 'L_hash', x: 455, y: 80 },
      { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 195 },
      { id: 'n_peelL', label: '# R', kind: 'write', x: 275, y: 195 },
      { id: 'n_seekR', label: 'R_# L', kind: 'builtin', builtinId: 'R_hash', x: 455, y: 195 },
      { id: 'n_peelR', label: '# L', kind: 'write', x: 640, y: 195 },
      { id: 'n_wipeRej', label: 'E', kind: 'builtin', builtinId: 'E', x: 455, y: 295 },
      { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: 455, y: 400 },
    ],
    edges: [
      { id: 'e_rew', from: 'n_rew', to: 'n_peelL', label: 'R' },
      {
        id: 'e_emp',
        from: 'n_rew',
        to: acceptsEmpty ? 'n_accept' : 'n_reject',
        label: '#',
        ...(acceptsEmpty
          ? {}
          : { curveOffset: 78, fromAnchor: 'bottom' as const, toAnchor: 'left' as const }),
      },
      { id: 'e_pL', from: 'n_peelL', to: 'n_seekR', label: p > 1 ? `${x}^${p}` : x },
      { id: 'e_sR', from: 'n_seekR', to: 'n_peelR', label: 'L' },
      { id: 'e_pR', from: 'n_peelR', to: 'n_seekL', label: q > 1 ? `${y}^${q}` : y },
      { id: 'e_sL', from: 'n_seekL', to: 'n_peelL', label: 'R' },
      { id: 'e_acc', from: 'n_peelL', to: 'n_accept', label: center ? center : '#' },
      ...(center !== null
        ? [{ id: 'e_cent_rej', from: 'n_peelL', to: 'n_reject', label: '#' }]
        : []),
      { id: 'e_badL', from: 'n_peelL', to: 'n_wipeRej', label: `≠ ${x}` },
      { id: 'e_badR', from: 'n_peelR', to: 'n_wipeRej', label: `≠ ${y}` },
      { id: 'e_endR', from: 'n_peelR', to: 'n_reject', label: '#' },
      { id: 'e_wipe', from: 'n_wipeRej', to: 'n_reject', label: '#' },
    ],
  };

  return finalizeTm(
    'compiled-cfg-powers',
    `CFG Decider: ${langStr}`,
    `Decides the context-free language { ${langStr} } via exact outer pair-peeling (${p} '${x}' left, ${q} '${y}' right).`,
    `Tier 2 pattern match (${descRatio}): peels ${p} leading '${x}' symbol(s) and ${q} trailing '${y}' symbol(s) per round by erasing to #, verifying ${center ? `center '${center}' and ` : ''}n ≥ ${minN}.`,
    sigma,
    [],
    states,
    transitions,
    grammar,
    cykAccepts,
    schemaDiagram,
  );
}

function tryBuildPalindrome(
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
): CompileResult | null {
  if (grammar.nonTerminals.length !== 1 || grammar.terminals.length === 0) return null;
  const S = grammar.startSymbol;
  const pairChars = new Set<string>();
  const centerChars = new Set<string>();
  let acceptEmpty = false;

  for (const p of grammar.productions) {
    if (p.rhs.length === 0) {
      acceptEmpty = true;
    } else if (p.rhs.length === 1 && !isNonTerminal(p.rhs[0])) {
      centerChars.add(p.rhs[0]);
    } else if (
      p.rhs.length === 3 &&
      !isNonTerminal(p.rhs[0]) &&
      p.rhs[1] === S &&
      p.rhs[2] === p.rhs[0]
    ) {
      pairChars.add(p.rhs[0]);
    } else {
      return null;
    }
  }

  if (pairChars.size === 0) return null;

  const sigma = grammar.terminals;
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_pickR' },
    { id: 'q_pickR', label: 'Pick right', x: 0, y: 0, schemaNodeId: 'n_pickR' },
    { id: 'q_seekR', label: 'Seek right →', x: 0, y: 0, schemaNodeId: 'n_seekR' },
    { id: 'q_wipeR', label: 'Wipe → (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipe' },
    { id: 'q_wipeL', label: 'Wipe ← (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipe' },
    { id: 'q_chk_only_empty', label: 'Center only?', x: 0, y: 0, schemaNodeId: 'n_matchL' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];

  for (const c of pairChars) {
    states.push({ id: `q_seekL_${c}`, label: `Seek L (${c})`, x: 0, y: 0, schemaNodeId: 'n_seekL' });
    states.push({ id: `q_chk_${c}`, label: `Match ${c}`, x: 0, y: 0, schemaNodeId: 'n_matchL' });
  }

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  add('q0', '#', 'q_pickR', '#', 'L');
  add('q_pickR', '#', acceptEmpty ? 'qH_acc' : 'qH_rej', acceptEmpty ? 'Ⓨ' : 'Ⓝ', 'R');

  let hasInvalidPick = false;
  for (const s of sigma) {
    if (pairChars.has(s)) {
      add('q_pickR', s, `q_seekL_${s}`, '#', 'L');
      for (const a of sigma) {
        add(`q_seekL_${s}`, a, `q_seekL_${s}`, a, 'L');
      }
      add(`q_seekL_${s}`, '#', `q_chk_${s}`, '#', 'R');

      add(`q_chk_${s}`, '#', centerChars.has(s) ? 'qH_acc' : 'qH_rej', centerChars.has(s) ? 'Ⓨ' : 'Ⓝ', 'R');
      add(`q_chk_${s}`, s, 'q_seekR', '#', 'R');
      for (const a of sigma) {
        if (a !== s) add(`q_chk_${s}`, a, 'q_wipeR', '#', 'R');
      }
    } else if (centerChars.has(s)) {
      add('q_pickR', s, 'q_chk_only_empty', '#', 'L');
    } else {
      hasInvalidPick = true;
      add('q_pickR', s, 'q_wipeL', '#', 'L');
    }
  }

  add('q_chk_only_empty', '#', 'qH_acc', 'Ⓨ', 'R');
  for (const s of sigma) {
    add('q_chk_only_empty', s, 'q_wipeL', '#', 'L');
    add('q_seekR', s, 'q_seekR', s, 'R');
    add('q_wipeR', s, 'q_wipeR', '#', 'R');
    add('q_wipeL', s, 'q_wipeL', '#', 'L');
  }
  add('q_seekR', '#', 'q_pickR', '#', 'L');
  add('q_wipeR', '#', 'qH_rej', 'Ⓝ', 'R');
  add('q_wipeL', '#', 'qH_rej', 'Ⓝ', 'R');

  const schemaDiagram: SchemaDiagram = {
    title: `CFG Decider: Palindromes — L&P Schema`,
    width: 630,
    height: 385,
    nodes: [
      { id: 'n_pickR', label: '> L', kind: 'start-action', x: 105, y: 185 },
      { id: 'n_seekL', label: 'L_# R', kind: 'builtin', builtinId: 'L_hash', x: 295, y: 185 },
      { id: 'n_matchL', label: '# R', kind: 'write', x: 495, y: 185 },
      { id: 'n_seekR', label: 'R_# L', kind: 'builtin', builtinId: 'R_hash', x: 295, y: 75 },
      { id: 'n_accept', label: 'Ⓨ R', kind: 'halt', variant: 'accept', x: 105, y: 320 },
      { id: 'n_wipe', label: 'E', kind: 'builtin', builtinId: 'E', x: 345, y: 320 },
      { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: 525, y: 320 },
    ],
    edges: [
      { id: 'e_pick', from: 'n_pickR', to: 'n_seekL', label: 'σ → #' },
      { id: 'e_empty', from: 'n_pickR', to: acceptEmpty ? 'n_accept' : 'n_reject', label: '#' },
      ...(centerChars.size > 0
        ? [{ id: 'e_center', from: 'n_pickR', to: 'n_matchL', label: Array.from(centerChars).join(', ') }]
        : []),
      ...(hasInvalidPick ? [{ id: 'e_inv', from: 'n_pickR', to: 'n_wipe', label: 'bad' }] : []),
      { id: 'e_sL', from: 'n_seekL', to: 'n_matchL', label: '#' },
      { id: 'e_mat', from: 'n_matchL', to: 'n_seekR', label: 'σ = σ' },
      { id: 'e_sR', from: 'n_seekR', to: 'n_pickR', label: '#' },
      ...(centerChars.size > 0
        ? [{ id: 'e_mid_acc', from: 'n_matchL', to: 'n_accept', label: '#' }]
        : [{ id: 'e_mid_rej', from: 'n_matchL', to: 'n_reject', label: '#' }]),
      { id: 'e_mis', from: 'n_matchL', to: 'n_wipe', label: '≠' },
      { id: 'e_wipe', from: 'n_wipe', to: 'n_reject', label: '#' },
    ],
  };

  return finalizeTm(
    'compiled-cfg-palindrome',
    `CFG Decider: Palindromes over {${sigma.join(', ')}}`,
    `Decides the palindrome CFL generated by the grammar over {${sigma.join(', ')}}.`,
    `Tier 2 palindrome pattern: erases the rightmost symbol, scans left to match the leftmost symbol, and repeats inward. ${acceptEmpty ? 'Accepts' : 'Rejects'} empty string; ${centerChars.size > 0 ? `accepts lone center symbol(s) {${Array.from(centerChars).join(', ')}}` : 'rejects odd-length strings'}.`,
    sigma,
    [],
    states,
    transitions,
    grammar,
    cykAccepts,
    schemaDiagram,
  );
}

function tryBuildDyck(
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
): CompileResult | null {
  if (grammar.nonTerminals.length !== 1) return null;
  const S = grammar.startSymbol;
  const rules = grammar.productions.map((p) => p.rhs.join('\0'));
  const ruleSet = new Set(rules);
  const sigma = grammar.terminals;
  if (sigma.length < 2 || sigma.length % 2 !== 0) return null;

  // Extract candidate pairs from rules of form `open S close` or `open S close S` or `S open S close`
  const pairs: Array<[string, string]> = [];
  const usedChars = new Set<string>();
  for (const p of grammar.productions) {
    const r = p.rhs;
    if (
      (r.length === 3 && !isNonTerminal(r[0]) && r[1] === S && !isNonTerminal(r[2])) ||
      (r.length === 4 && !isNonTerminal(r[0]) && r[1] === S && !isNonTerminal(r[2]) && r[3] === S) ||
      (r.length === 4 && r[0] === S && !isNonTerminal(r[1]) && r[2] === S && !isNonTerminal(r[3]))
    ) {
      const open = r[0] === S ? r[1] : r[0];
      const close = r[0] === S ? r[3] : r[2];
      if (open === close) return null;
      if (usedChars.has(open) || usedChars.has(close)) {
        // Check if duplicate pair already added
        if (!pairs.some(([o, c]) => o === open && c === close)) return null;
      } else {
        usedChars.add(open);
        usedChars.add(close);
        pairs.push([open, close]);
      }
    }
  }

  if (pairs.length === 0 || usedChars.size !== sigma.length) return null;

  // Verify exact Dyck equivalence
  const k = (arr: string[]) => arr.join('\0');
  let allowEmpty: boolean;

  if (pairs.length === 1) {
    const [o, c] = pairs[0];
    const emptyForm1 = new Set([k([]), k([o, S, c, S])]);
    const emptyForm2 = new Set([k([]), k([S, o, S, c])]);
    const emptyForm3 = new Set([k([]), k([o, S, c]), k([S, S])]);
    const emptyForm4 = new Set([k([]), k([o, S, c]), k([o, c]), k([S, S])]);
    const nonEmptyForm1 = new Set([k([o, c]), k([o, S, c]), k([S, S])]);
    const nonEmptyForm2 = new Set([k([o, c]), k([o, S, c]), k([o, c, S]), k([o, S, c, S])]);

    const matchesSet = (target: Set<string>) =>
      ruleSet.size === target.size && Array.from(ruleSet).every((r) => target.has(r));

    if (matchesSet(emptyForm1) || matchesSet(emptyForm2) || matchesSet(emptyForm3) || matchesSet(emptyForm4)) {
      allowEmpty = true;
    } else if (matchesSet(nonEmptyForm1) || matchesSet(nonEmptyForm2)) {
      allowEmpty = false;
    } else {
      return null;
    }
  } else {
    const emptyMulti1 = new Set<string>([k([]), k([S, S])]);
    const emptyMulti2 = new Set<string>([k([]), k([S, S])]);
    const emptyMulti3 = new Set<string>([k([])]);
    const nonEmptyMulti = new Set<string>([k([S, S])]);
    for (const [o, c] of pairs) {
      emptyMulti1.add(k([o, S, c]));
      emptyMulti2.add(k([o, S, c]));
      emptyMulti2.add(k([o, c]));
      emptyMulti3.add(k([o, S, c, S]));
      nonEmptyMulti.add(k([o, c]));
      nonEmptyMulti.add(k([o, S, c]));
    }
    const matchesSet = (target: Set<string>) =>
      ruleSet.size === target.size && Array.from(ruleSet).every((r) => target.has(r));

    if (matchesSet(emptyMulti1) || matchesSet(emptyMulti2) || matchesSet(emptyMulti3)) {
      allowEmpty = true;
    } else if (matchesSet(nonEmptyMulti)) {
      allowEmpty = false;
    } else {
      return null;
    }
  }

  const marker = ['X', '§', '◊'].find((m) => !sigma.includes(m))!;
  const opens = new Set(pairs.map(([o]) => o));

  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_chk_empty', label: 'Non-empty?', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_rew', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_scan', label: 'Find close →', x: 0, y: 0, schemaNodeId: 'n_scan' },
    { id: 'q_verify', label: 'Verify ←', x: 0, y: 0, schemaNodeId: 'n_verify' },
    { id: 'q_wipeL', label: 'Wipe ← (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipe' },
    { id: 'q_goEnd', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_wipe' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];

  pairs.forEach(([o], idx) => {
    states.push({ id: `q_match_${idx}`, label: `Find ${o} ←`, x: 0, y: 0, schemaNodeId: 'n_match' });
  });

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  add('q0', '#', 'q_chk_empty', '#', 'L');
  add('q_chk_empty', '#', allowEmpty ? 'qH_acc' : 'qH_rej', allowEmpty ? 'Ⓨ' : 'Ⓝ', 'R');
  for (const s of sigma) {
    add('q_chk_empty', s, 'q_rew', s, 'L');
    add('q_rew', s, 'q_rew', s, 'L');
  }
  add('q_rew', '#', 'q_scan', '#', 'R');

  add('q_scan', marker, 'q_scan', marker, 'R');
  add('q_scan', '#', 'q_verify', '#', 'L');
  pairs.forEach(([o, c], idx) => {
    add('q_scan', o, 'q_scan', o, 'R');
    add('q_scan', c, `q_match_${idx}`, marker, 'L');

    add(`q_match_${idx}`, marker, `q_match_${idx}`, marker, 'L');
    add(`q_match_${idx}`, o, 'q_scan', marker, 'R');
    add(`q_match_${idx}`, '#', 'q_goEnd', '#', 'R');
    for (const otherOpen of opens) {
      if (otherOpen !== o) {
        add(`q_match_${idx}`, otherOpen, 'q_goEnd', marker, 'R');
      }
    }
  });

  add('q_verify', marker, 'q_verify', '#', 'L');
  add('q_verify', '#', 'qH_acc', 'Ⓨ', 'R');
  for (const o of opens) {
    add('q_verify', o, 'q_wipeL', '#', 'L');
  }

  for (const s of [...sigma, marker]) {
    add('q_goEnd', s, 'q_goEnd', marker, 'R');
    add('q_wipeL', s, 'q_wipeL', '#', 'L');
  }
  add('q_goEnd', '#', 'q_wipeL', '#', 'L');
  add('q_wipeL', '#', 'qH_rej', 'Ⓝ', 'R');

  const pairNames = pairs.map(([o, c]) => `${o}${c}`).join(' ');
  const openList = pairs.map(([o]) => o).join(', ');
  const closeList = pairs.map(([, c]) => c).join(', ');
  const schemaDiagram: SchemaDiagram = {
    title: `CFG Decider: Balanced ${pairNames} — L&P Schema`,
    width: 580,
    height: 430,
    nodes: [
      { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 135 },
      { id: 'n_scan', label: 'R', kind: 'move', x: 270, y: 135 },
      { id: 'n_match', label: `${marker} L`, kind: 'write', x: 470, y: 135 },
      { id: 'n_verify', label: '# L', kind: 'write', x: 270, y: 255 },
      { id: 'n_wipe', label: 'E', kind: 'builtin', builtinId: 'E', x: 470, y: 255 },
      {
        id: 'n_accept',
        label: 'Ⓨ R',
        kind: 'halt',
        variant: 'accept',
        x: allowEmpty ? 95 : 270,
        y: 365,
      },
      {
        id: 'n_reject',
        label: 'Ⓝ R',
        kind: 'halt',
        variant: 'reject',
        x: allowEmpty ? 470 : 95,
        y: 365,
      },
    ],
    edges: [
      { id: 'e_rew', from: 'n_rew', to: 'n_scan', label: 'R' },
      { id: 'e_emp', from: 'n_rew', to: allowEmpty ? 'n_accept' : 'n_reject', label: '#' },
      { id: 'e_sl_s', from: 'n_scan', to: 'n_scan', label: `${openList}, ${marker}`, isSelfLoop: true, loopAngleDeg: -90 },
      { id: 'e_cls', from: 'n_scan', to: 'n_match', label: closeList },
      { id: 'e_sl_m', from: 'n_match', to: 'n_match', label: marker, isSelfLoop: true, loopAngleDeg: -90 },
      { id: 'e_back', from: 'n_match', to: 'n_scan', label: `${openList} → ${marker}`, curveOffset: -60 },
      { id: 'e_ver', from: 'n_scan', to: 'n_verify', label: '#' },
      { id: 'e_sl_v', from: 'n_verify', to: 'n_verify', label: marker, isSelfLoop: true, loopAngleDeg: -90 },
      { id: 'e_acc', from: 'n_verify', to: 'n_accept', label: '#' },
      { id: 'e_bad_m', from: 'n_match', to: 'n_wipe', label: `#, ≠` },
      { id: 'e_bad_v', from: 'n_verify', to: 'n_wipe', label: openList },
      { id: 'e_rej', from: 'n_wipe', to: 'n_reject', label: '#' },
    ],
  };

  return finalizeTm(
    'compiled-cfg-dyck',
    `CFG Decider: Balanced ${pairNames}`,
    `Decides balanced ${pairNames} Dyck expressions${allowEmpty ? '' : ' (non-empty)'}.`,
    `Tier 2 Dyck bracket pattern: scans left-to-right for each closing bracket, matches the nearest preceding opening bracket with marker '${marker}', and verifies leftwards that zero unmatched openers remain.`,
    sigma,
    [marker],
    states,
    transitions,
    grammar,
    cykAccepts,
    schemaDiagram,
  );
}

function tryBuildEqualCounts(
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
): CompileResult | null {
  if (grammar.nonTerminals.length !== 1 || grammar.terminals.length !== 2) return null;
  const S = grammar.startSymbol;
  const [x, y] = grammar.terminals;
  const k = (arr: string[]) => arr.join('\0');
  const ruleSet = new Set(grammar.productions.map((p) => k(p.rhs)));
  const eq = (target: Set<string>) =>
    ruleSet.size === target.size && Array.from(ruleSet).every((r) => target.has(r));

  const empty1 = new Set([k([]), k([x, S, y, S]), k([y, S, x, S])]);
  const empty2 = new Set([k([]), k([S, x, S, y]), k([S, y, S, x])]);
  const empty3 = new Set([k([]), k([x, S, y]), k([y, S, x]), k([S, S])]);
  const nonEmpty = new Set([k([x, y]), k([y, x]), k([x, S, y]), k([y, S, x]), k([S, S])]);

  let allowEmpty: boolean;
  if (eq(empty1) || eq(empty2) || eq(empty3)) allowEmpty = true;
  else if (eq(nonEmpty)) allowEmpty = false;
  else return null;

  const marker = ['X', '§', '◊'].find((m) => m !== x && m !== y)!;
  const states: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_chk_empty', label: 'Non-empty?', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_rew', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_find', label: 'Find unmarked', x: 0, y: 0, schemaNodeId: 'n_find' },
    { id: 'q_seek_x', label: `Pair ${x} →`, x: 0, y: 0, schemaNodeId: 'n_pair' },
    { id: 'q_seek_y', label: `Pair ${y} →`, x: 0, y: 0, schemaNodeId: 'n_pair' },
    { id: 'q_wipe_acc', label: 'Clean (Ⓨ)', x: 0, y: 0, schemaNodeId: 'n_clean_acc' },
    { id: 'q_wipe_rej', label: 'Clean (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_clean_rej' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  add('q0', '#', 'q_chk_empty', '#', 'L');
  add('q_chk_empty', '#', allowEmpty ? 'qH_acc' : 'qH_rej', allowEmpty ? 'Ⓨ' : 'Ⓝ', 'R');
  for (const s of [x, y]) {
    add('q_chk_empty', s, 'q_rew', s, 'L');
    add('q_rew', s, 'q_rew', s, 'L');
  }
  add('q_rew', '#', 'q_find', '#', 'R');

  add('q_find', marker, 'q_find', marker, 'R');
  add('q_find', x, 'q_seek_y', marker, 'R');
  add('q_find', y, 'q_seek_x', marker, 'R');
  add('q_find', '#', 'q_wipe_acc', '#', 'L');

  add('q_seek_y', marker, 'q_seek_y', marker, 'R');
  add('q_seek_y', x, 'q_seek_y', x, 'R');
  add('q_seek_y', y, 'q_rew', marker, 'L');
  add('q_seek_y', '#', 'q_wipe_rej', '#', 'L');

  add('q_seek_x', marker, 'q_seek_x', marker, 'R');
  add('q_seek_x', y, 'q_seek_x', y, 'R');
  add('q_seek_x', x, 'q_rew', marker, 'L');
  add('q_seek_x', '#', 'q_wipe_rej', '#', 'L');

  add('q_rew', marker, 'q_rew', marker, 'L');

  add('q_wipe_acc', marker, 'q_wipe_acc', '#', 'L');
  add('q_wipe_acc', '#', 'qH_acc', 'Ⓨ', 'R');

  for (const s of [x, y, marker]) {
    add('q_wipe_rej', s, 'q_wipe_rej', '#', 'L');
  }
  add('q_wipe_rej', '#', 'qH_rej', 'Ⓝ', 'R');

  const schemaDiagram: SchemaDiagram = {
    title: `CFG Decider: #_${x}(w) = #_${y}(w) — L&P Schema`,
    width: 580,
    height: 430,
    nodes: [
      { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 135 },
      { id: 'n_find', label: `${marker} R`, kind: 'write', x: 270, y: 135 },
      { id: 'n_pair', label: `${marker} L_#`, kind: 'builtin', builtinId: 'L_hash', x: 470, y: 135 },
      { id: 'n_clean_acc', label: 'E', kind: 'builtin', builtinId: 'E', x: 270, y: 255 },
      { id: 'n_clean_rej', label: 'E', kind: 'builtin', builtinId: 'E', x: 470, y: 255 },
      {
        id: 'n_accept',
        label: 'Ⓨ R',
        kind: 'halt',
        variant: 'accept',
        x: allowEmpty ? 95 : 270,
        y: 365,
      },
      {
        id: 'n_reject',
        label: 'Ⓝ R',
        kind: 'halt',
        variant: 'reject',
        x: allowEmpty ? 470 : 95,
        y: 365,
      },
    ],
    edges: [
      { id: 'e_rew', from: 'n_rew', to: 'n_find', label: 'R' },
      { id: 'e_emp', from: 'n_rew', to: allowEmpty ? 'n_accept' : 'n_reject', label: '#' },
      { id: 'e_sl_f', from: 'n_find', to: 'n_find', label: marker, isSelfLoop: true, loopAngleDeg: -90 },
      { id: 'e_pick', from: 'n_find', to: 'n_pair', label: `${x}, ${y}` },
      { id: 'e_loop', from: 'n_pair', to: 'n_rew', label: `${y}, ${x}`, curveOffset: -70 },
      { id: 'e_done', from: 'n_find', to: 'n_clean_acc', label: '#' },
      { id: 'e_mis', from: 'n_pair', to: 'n_clean_rej', label: '#' },
      { id: 'e_acc', from: 'n_clean_acc', to: 'n_accept', label: '#' },
      { id: 'e_rej', from: 'n_clean_rej', to: 'n_reject', label: '#' },
    ],
  };

  return finalizeTm(
    'compiled-cfg-eqcount',
    `CFG Decider: #_${x}(w) = #_${y}(w)`,
    `Decides { w ∈ {${x}, ${y}}* | count(${x}) = count(${y}) }.`,
    `Tier 2 equal-counts pattern: pairs each leftmost unmarked '${x}' or '${y}' with its counterpart using marker '${marker}', cleaning markers to output #Ⓨ# or #Ⓝ#.`,
    [x, y],
    [marker],
    states,
    transitions,
    grammar,
    cykAccepts,
    schemaDiagram,
  );
}

// ============================================================================
// Tier 3: General CFG Bottom-Up Production-Reducing TM
// ============================================================================

interface TrieNode {
  id: number;
  depth: number;
  children: Map<string, TrieNode>;
  acceptRule?: { lhs: string; len: number };
  lastAccept?: { lhs: string; len: number };
}

function buildNormalizedReductionRules(grammar: ParsedGrammar): {
  acceptsEmpty: boolean;
  rules: Production[];
  activeNonTerminals: string[];
} {
  const { acceptsEmpty, unitFree } = eliminateEpsilonAndUnitProductions(grammar);

  // Prune non-generating nonterminals
  const generating = new Set<string>();
  let genChanged = true;
  while (genChanged) {
    genChanged = false;
    for (const p of unitFree) {
      if (!generating.has(p.lhs) && p.rhs.every((s) => !isNonTerminal(s) || generating.has(s))) {
        generating.add(p.lhs);
        genChanged = true;
      }
    }
  }

  const genRules = unitFree.filter(
    (p) => generating.has(p.lhs) && p.rhs.every((s) => !isNonTerminal(s) || generating.has(s)),
  );

  const activeSet = new Set<string>([grammar.startSymbol]);
  for (const p of genRules) {
    activeSet.add(p.lhs);
    for (const s of p.rhs) {
      if (isNonTerminal(s)) activeSet.add(s);
    }
  }

  return {
    acceptsEmpty,
    rules: genRules,
    activeNonTerminals: Array.from(activeSet).sort(),
  };
}

function compileTier3GeneralCfg(
  grammar: ParsedGrammar,
  cykAccepts: (w: string) => boolean,
): CompileResult {
  const { acceptsEmpty, rules, activeNonTerminals } = buildNormalizedReductionRules(grammar);
  const sigma = grammar.terminals;
  const workSyms = Array.from(new Set([...sigma, ...activeNonTerminals]));
  const marker = ['◊', '§', '¤', '∆'].find((m) => !workSyms.includes(m))!;

  const states: StateNode[] = [
    {
      id: 'q0',
      label: 'Start',
      x: 0,
      y: 0,
      isStart: true,
      schemaNodeId: rules.length === 0 ? 'n_start' : 'n_rew',
    },
    {
      id: 'q_chk_empty',
      label: 'Non-empty?',
      x: 0,
      y: 0,
      schemaNodeId: rules.length === 0 ? 'n_start' : 'n_rew',
    },
    { id: 'q_wipeL_rej', label: 'Wipe ← (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_wipe' },
    ...(acceptsEmpty || rules.length > 0
      ? [{ id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' }]
      : []),
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];
  const stateIds = new Set(states.map((s) => s.id));
  const ensureState = (id: string, label: string, schemaNodeId: string) => {
    if (!stateIds.has(id)) {
      stateIds.add(id);
      states.push({ id, label, x: 0, y: 0, schemaNodeId });
    }
  };

  const transitions: TransitionRule[] = [];
  let rId = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push({ id: `r${rId++}`, from, read, to, write, move });
  };

  add('q0', '#', 'q_chk_empty', '#', 'L');
  add('q_chk_empty', '#', acceptsEmpty ? 'qH_acc' : 'qH_rej', acceptsEmpty ? 'Ⓨ' : 'Ⓝ', 'R');

  for (const s of workSyms) {
    add('q_wipeL_rej', s, 'q_wipeL_rej', '#', 'L');
  }
  add('q_wipeL_rej', '#', 'qH_rej', 'Ⓝ', 'R');

  if (rules.length === 0) {
    for (const s of workSyms) {
      add('q_chk_empty', s, 'q_wipeL_rej', '#', 'L');
    }
    const emptySchema: SchemaDiagram = {
      title: `CFG Reducer (${grammar.startSymbol}) — L&P Schema`,
      width: 460,
      height: 330,
      nodes: [
        { id: 'n_start', label: '> L', kind: 'start-action', x: 115, y: 125 },
        { id: 'n_wipe', label: 'E', kind: 'builtin', builtinId: 'E', x: 320, y: 125 },
        ...(acceptsEmpty
          ? [{ id: 'n_accept', label: 'Ⓨ R', kind: 'halt' as const, variant: 'accept' as const, x: 115, y: 255 }]
          : []),
        { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: 320, y: 255 },
      ],
      edges: [
        { id: 'e_emp', from: 'n_start', to: acceptsEmpty ? 'n_accept' : 'n_reject', label: '#' },
        { id: 'e_non', from: 'n_start', to: 'n_wipe', label: 'σ ≠ #' },
        { id: 'e_rej', from: 'n_wipe', to: 'n_reject', label: '#' },
      ],
    };

    return finalizeTm(
      'compiled-cfg-general',
      `CFG Decider (${grammar.startSymbol})`,
      `Bottom-up reducing TM for CFG with start symbol ${grammar.startSymbol}.`,
      `Tier 3 general CFG reducer: no non-empty derivations remain after ε/unit elimination; ${acceptsEmpty ? 'accepts ε and rejects non-empty inputs' : 'rejects all inputs'}.`,
      sigma,
      activeNonTerminals,
      states,
      transitions,
      grammar,
      cykAccepts,
      emptySchema,
    );
  }

  ensureState('q_rew_restart', 'Rewind ←', 'n_rew');
  ensureState('q_chk_final', `Check ${grammar.startSymbol}`, 'n_check');
  ensureState('q_chk_only_S', 'Only S?', 'n_check');

  for (const s of workSyms) {
    add('q_chk_empty', s, 'q_rew_restart', s, 'L');
    add('q_rew_restart', s, 'q_rew_restart', s, 'L');
  }
  add('q_rew_restart', '#', 'q_trie_0', '#', 'R');

  // Final tape check after a pass with zero reductions
  add('q_chk_final', grammar.startSymbol, 'q_chk_only_S', '#', 'L');
  add('q_chk_final', '#', 'qH_rej', 'Ⓝ', 'R');
  for (const s of workSyms) {
    if (s !== grammar.startSymbol) {
      add('q_chk_final', s, 'q_wipeL_rej', '#', 'L');
    }
  }
  add('q_chk_only_S', '#', 'qH_acc', 'Ⓨ', 'R');
  for (const s of workSyms) {
    add('q_chk_only_S', s, 'q_wipeL_rej', '#', 'L');
  }

  // Build RHS prefix trie (preferring non-start LHS on duplicate RHS so inner reductions don't prematurely stop)
  const sortedRules = [...rules].sort((a, b) => {
    const aIsS = a.lhs === grammar.startSymbol ? 1 : 0;
    const bIsS = b.lhs === grammar.startSymbol ? 1 : 0;
    if (aIsS !== bIsS) return aIsS - bIsS;
    return b.rhs.length - a.rhs.length;
  });

  let trieId = 0;
  const root: TrieNode = { id: trieId++, depth: 0, children: new Map() };
  for (const rule of sortedRules) {
    let cur = root;
    for (const sym of rule.rhs) {
      if (!cur.children.has(sym)) {
        cur.children.set(sym, { id: trieId++, depth: cur.depth + 1, children: new Map() });
      }
      cur = cur.children.get(sym)!;
    }
    if (!cur.acceptRule) {
      cur.acceptRule = { lhs: rule.lhs, len: rule.rhs.length };
    }
  }

  const trieNodes: TrieNode[] = [];
  const assignLastAccept = (node: TrieNode, inherited?: { lhs: string; len: number }) => {
    node.lastAccept = node.acceptRule ?? inherited;
    trieNodes.push(node);
    for (const child of node.children.values()) {
      assignLastAccept(child, node.lastAccept);
    }
  };
  assignLastAccept(root, undefined);

  // Build shift subroutines for each needed (lhs, rem) where rem = k - 1 >= 1
  const createdShiftTags = new Set<string>();
  const ensureShiftChain = (lhs: string, k: number) => {
    if (k < 2) return;

    for (let rem = k - 1; rem >= 1; rem -= 1) {
      const tag = `${lhs}_${rem}`;
      if (createdShiftTags.has(tag)) break;
      createdShiftTags.add(tag);

      const blankId = `q_sh_b_${tag}`;
      const loopId = `q_sh_l_${tag}`;
      const advId = `q_sh_a_${tag}`;
      const rewId = `q_sh_r_${tag}`;

      ensureState(blankId, `Shift(${lhs})`, 'n_reduce');
      ensureState(loopId, `Shift(${lhs})`, 'n_reduce');
      ensureState(advId, `Shift(${lhs})`, 'n_reduce');
      ensureState(rewId, `Back ${marker}`, 'n_reduce');

      for (const s of workSyms) {
        add(blankId, s, loopId, '#', 'R');

        const wId = `q_sh_w_${tag}_${s}`;
        ensureState(wId, `Write ${s}`, 'n_reduce');
        add(loopId, s, wId, '#', 'L');
        add(wId, '#', advId, s, 'R');
      }
      add(loopId, '#', rewId, '#', 'L');
      add(advId, '#', loopId, '#', 'R');

      add(rewId, '#', rewId, '#', 'L');
      for (const s of workSyms) {
        add(rewId, s, rewId, s, 'L');
      }
      if (rem > 1) {
        add(rewId, marker, `q_sh_b_${lhs}_${rem - 1}`, marker, 'R');
      } else {
        add(rewId, marker, 'q_rew_restart', lhs, 'L');
      }
    }
  };

  // Helper to emit step-back chains to reduction position i or retry position i+1
  const createdRetryChains = new Set<number>();
  const getRetryState = (stepsLeft: number): string => {
    if (stepsLeft === 0) return 'q_trie_0';
    if (!createdRetryChains.has(stepsLeft)) {
      createdRetryChains.add(stepsLeft);
      const id = `q_retry_${stepsLeft}`;
      ensureState(id, `Retry ←${stepsLeft}`, 'n_scan');
      const nextId = getRetryState(stepsLeft - 1);
      for (const s of [...workSyms, '#']) {
        add(id, s, nextId, s, 'L');
      }
    }
    return `q_retry_${stepsLeft}`;
  };

  const createdReduceBack = new Set<string>();
  const getReduceBackState = (stepsLeft: number, lhs: string, len: number): string => {
    const id = `q_rb_${stepsLeft}_${lhs}_${len}`;
    if (createdReduceBack.has(id)) return id;
    createdReduceBack.add(id);

    if (stepsLeft === 0) {
      ensureState(id, `Reduce → ${lhs}`, 'n_reduce');
      if (len === 1) {
        for (const s of workSyms) {
          add(id, s, 'q_rew_restart', lhs, 'L');
        }
      } else {
        ensureShiftChain(lhs, len);
        for (const s of workSyms) {
          add(id, s, `q_sh_b_${lhs}_${len - 1}`, marker, 'R');
        }
      }
      return id;
    }

    ensureState(id, `Back ←${stepsLeft}`, 'n_reduce');
    const nextId = getReduceBackState(stepsLeft - 1, lhs, len);
    for (const s of [...workSyms, '#']) {
      add(id, s, nextId, s, 'L');
    }
    return id;
  };

  // Emit trie transitions
  for (const node of trieNodes) {
    const nodeId = `q_trie_${node.id}`;
    ensureState(nodeId, node.depth === 0 ? 'Scan →' : `Match d=${node.depth}`, 'n_scan');
  }

  for (const node of trieNodes) {
    const nodeId = `q_trie_${node.id}`;
    if (node.depth === 0) {
      add(nodeId, '#', 'q_chk_final', '#', 'L');
      for (const s of workSyms) {
        const child = node.children.get(s);
        if (child) add(nodeId, s, `q_trie_${child.id}`, s, 'R');
        else add(nodeId, s, nodeId, s, 'R');
      }
      continue;
    }

    for (const s of [...workSyms, '#']) {
      const child = s !== '#' ? node.children.get(s) : undefined;
      if (child) {
        add(nodeId, s, `q_trie_${child.id}`, s, 'R');
      } else if (node.lastAccept) {
        const { lhs, len } = node.lastAccept;
        const target = getReduceBackState(node.depth - 1, lhs, len);
        add(nodeId, s, target, s, 'L');
      } else if (node.depth === 1) {
        add(nodeId, s, 'q_trie_0', s, 'S');
      } else {
        const target = getRetryState(node.depth - 2);
        add(nodeId, s, target, s, 'L');
      }
    }
  }

  const schemaDiagram: SchemaDiagram = {
    title: `CFG Reducer (${grammar.startSymbol}) — L&P Schema`,
    width: 580,
    height: 430,
    nodes: [
      { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 135 },
      { id: 'n_scan', label: 'R', kind: 'move', x: 270, y: 135 },
      { id: 'n_reduce', label: 'S_L A', kind: 'builtin', builtinId: 'S_L', x: 470, y: 135 },
      { id: 'n_check', label: '# L', kind: 'write', x: 270, y: 255 },
      { id: 'n_wipe', label: 'E', kind: 'builtin', builtinId: 'E', x: 470, y: 255 },
      {
        id: 'n_accept',
        label: 'Ⓨ R',
        kind: 'halt',
        variant: 'accept',
        x: acceptsEmpty ? 95 : 270,
        y: 365,
      },
      {
        id: 'n_reject',
        label: 'Ⓝ R',
        kind: 'halt',
        variant: 'reject',
        x: acceptsEmpty ? 470 : 95,
        y: 365,
      },
    ],
    edges: [
      { id: 'e_rew', from: 'n_rew', to: 'n_scan', label: 'R' },
      { id: 'e_emp', from: 'n_rew', to: acceptsEmpty ? 'n_accept' : 'n_reject', label: '#' },
      { id: 'e_sl_s', from: 'n_scan', to: 'n_scan', label: 'scan', isSelfLoop: true, loopAngleDeg: -90 },
      { id: 'e_red', from: 'n_scan', to: 'n_reduce', label: 'α' },
      { id: 'e_loop', from: 'n_reduce', to: 'n_rew', label: 'A', curveOffset: -70 },
      { id: 'e_chk', from: 'n_scan', to: 'n_check', label: '#' },
      { id: 'e_acc', from: 'n_check', to: 'n_accept', label: grammar.startSymbol },
      { id: 'e_bad', from: 'n_check', to: 'n_wipe', label: `≠ ${grammar.startSymbol}` },
      { id: 'e_rej', from: 'n_wipe', to: 'n_reject', label: '#' },
    ],
  };

  return finalizeTm(
    'compiled-cfg-general',
    `CFG Reducer (${grammar.startSymbol})`,
    `Bottom-up production-reducing decider for the context-free grammar with start symbol ${grammar.startSymbol}.`,
    `Tier 3 general CFG compiler: eliminates ε- and unit-productions (${rules.length} active reductions), scans left-to-right via a prefix trie for α in A → α, replaces α with A while shifting the tail leftwards gap-free, and accepts iff the tape reduces to #${grammar.startSymbol}#.`,
    sigma,
    [...activeNonTerminals, marker],
    states,
    transitions,
    grammar,
    cykAccepts,
    schemaDiagram,
  );
}

export function compileCfgToTm(spec: ContextFreeSpec): CompileResult {
  const parsed = parseCfg(spec.grammar);
  if (!parsed.ok) return parsed;
  const { grammar } = parsed;

  // Tier 1: Right-Linear / Regular Grammar
  if (isRightLinear(grammar)) {
    return compileTier1RightLinear(grammar);
  }

  const cykAccepts = buildCykChecker(grammar);

  // Tier 2: Exact Parametric CFL Patterns
  const powers = tryBuildMatchedPowers(grammar, cykAccepts);
  if (powers) return powers;

  const palindrome = tryBuildPalindrome(grammar, cykAccepts);
  if (palindrome) return palindrome;

  const dyck = tryBuildDyck(grammar, cykAccepts);
  if (dyck) return dyck;

  const eqCount = tryBuildEqualCounts(grammar, cykAccepts);
  if (eqCount) return eqCount;

  // Tier 3: General CFG Bottom-Up Production-Reducing TM
  return compileTier3GeneralCfg(grammar, cykAccepts);
}
