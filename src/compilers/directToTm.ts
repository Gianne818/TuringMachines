import { autoLayoutStates } from '../engine/layout';
import { MacroCompiler } from '../engine/macroCompiler';
import { runSimulation } from '../engine/simulator';
import type {
  BuiltInId,
  SampleInput,
  SchemaDiagram,
  SchemaEdge,
  SchemaNode,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import type { CompileResult, DirectTmSpec, PipelineOp } from './types';

const BASE_WORK_ALPHABET = ['a', 'b', 'c', 'd', 'I', '0', '1'];
const RESERVED_TAPES = new Set(['#', 'Ⓨ', 'Ⓝ']);

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

function parseSymbolList(raw: string, fallback: string[]): { ok: true; symbols: string[] } | { ok: false; error: string } {
  const trimmed = raw.trim();
  const tokens =
    trimmed.length === 0
      ? fallback
      : /[\s,]/.test(trimmed)
        ? trimmed.split(/[\s,]+/).filter(Boolean)
        : Array.from(trimmed);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (tok.length !== 1) {
      return { ok: false, error: `Alphabet symbol '${tok}' must be a single character.` };
    }
    if (RESERVED_TAPES.has(tok)) {
      return { ok: false, error: `Reserved symbol '${tok}' cannot be part of the input alphabet.` };
    }
    if (!seen.has(tok)) {
      seen.add(tok);
      unique.push(tok);
    }
  }

  if (unique.length === 0) {
    return { ok: false, error: 'Alphabet must contain at least one symbol.' };
  }
  return { ok: true, symbols: unique };
}

function pickFreshMarkers(used: Set<string>, count: number): string[] {
  const pool = ['X', 'Y', 'Z', 'S', 'U', 'V', 'W', 'M', 'N', '§', '◊', '∆'];
  const picked: string[] = [];
  for (const c of pool) {
    if (!used.has(c)) {
      picked.push(c);
      used.add(c);
      if (picked.length === count) return picked;
    }
  }
  throw new Error('Could not allocate unique tape markers.');
}

function isBuiltIn(op: PipelineOp): op is BuiltInId {
  return op === 'L_hash' || op === 'R_hash' || op === 'S_L' || op === 'S_R' || op === 'E' || op === 'C';
}

function formatOpLabel(op: PipelineOp, symbol?: string): string {
  switch (op) {
    case 'L_hash':
      return 'L_#';
    case 'R_hash':
      return 'R_#';
    case 'S_L':
      return 'S_L';
    case 'S_R':
      return 'S_R';
    case 'E':
      return 'E';
    case 'C':
      return 'C';
    case 'L':
      return 'L';
    case 'R':
      return 'R';
    case 'write':
      return symbol ?? '#';
  }
}

function buildPipelineTm(spec: DirectTmSpec): CompileResult {
  const steps = spec.pipeline;
  if (!steps || steps.length === 0) {
    return { ok: false, error: 'Pipeline must contain at least one step.' };
  }

  const extraWriteSyms: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.op === 'write') {
      const sym = step.symbol?.trim();
      if (!sym || sym.length !== 1) {
        return { ok: false, error: `Pipeline step ${i + 1} ('write') requires a single-character symbol.` };
      }
      if (sym !== '#' && !BASE_WORK_ALPHABET.includes(sym) && !extraWriteSyms.includes(sym)) {
        extraWriteSyms.push(sym);
      }
    }
  }

  const workAlpha = [...BASE_WORK_ALPHABET, ...extraWriteSyms];
  const mc = new MacroCompiler(workAlpha);

  const compiledBlocks: Array<{
    entry: string;
    connect: (symbols: string[], targetState: string, move?: 'L' | 'R' | 'S') => void;
  }> = [];
  const schemaNodes: SchemaNode[] = [];
  const schemaEdges: SchemaEdge[] = [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const nodeId = `p_${i}`;
    const baseLabel = formatOpLabel(step.op, step.symbol?.trim());
    const label = i === 0 ? `> ${baseLabel}` : baseLabel;

    let block;
    let kind: SchemaNode['kind'];
    let builtinId: BuiltInId | undefined;

    if (isBuiltIn(step.op)) {
      block = mc.createBuiltIn(step.op, nodeId, [baseLabel]);
      kind = 'builtin';
      builtinId = step.op;
    } else if (step.op === 'L' || step.op === 'R') {
      block = mc.createMove(step.op, nodeId, [baseLabel]);
      kind = i === 0 ? 'start-action' : 'move';
    } else {
      const sym = step.symbol!.trim();
      block = mc.createWrite(sym, nodeId, [baseLabel]);
      kind = i === 0 ? 'start-action' : 'write';
    }

    compiledBlocks.push(block);
    schemaNodes.push({
      id: nodeId,
      label,
      kind,
      builtinId,
      x: 95 + i * 150,
      y: 120,
    });

    if (i > 0) {
      schemaEdges.push({
        id: `e_${i - 1}`,
        from: `p_${i - 1}`,
        to: nodeId,
      });
    }
  }

  const halt = mc.newState('Halt', 'p_halt', ['Halt']);
  schemaNodes.push({
    id: 'p_halt',
    label: 'Halt',
    kind: 'halt',
    x: 95 + steps.length * 150,
    y: 120,
  });
  schemaEdges.push({
    id: `e_end`,
    from: `p_${steps.length - 1}`,
    to: 'p_halt',
    label: '#',
  });

  for (let i = 0; i < compiledBlocks.length; i += 1) {
    const target = i + 1 < compiledBlocks.length ? compiledBlocks[i + 1].entry : halt;
    compiledBlocks[i].connect(mc.fullAlphabet, target, 'S');
  }

  const isStandaloneRHash = steps.length === 1 && steps[0].op === 'R_hash';
  const compiled = mc.finalize(compiledBlocks[0].entry, [halt], { colGap: 155, rowGap: 95 });
  const pipelineLabel = steps.map((s) => formatOpLabel(s.op, s.symbol?.trim())).join(' → ');

  const schemaDiagram: SchemaDiagram = {
    title: `Macro Pipeline: > ${pipelineLabel}`,
    width: Math.max(480, 140 + schemaNodes.length * 150),
    height: 230,
    nodes: schemaNodes,
    edges: schemaEdges,
  };

  const machine: TuringMachineDefinition = {
    id: `compiled-pipeline-${Date.now().toString(36)}`,
    name: `Pipeline: > ${pipelineLabel}`,
    category: 'classic-tm',
    kind: 'transducer',
    description: `Lewis & Papadimitriou macro pipeline executing > ${pipelineLabel}.`,
    algorithmSummary: `Compiles ${steps.length} sequential macro/primitive block(s) (${pipelineLabel}) via MacroCompiler with synchronized schema-diagram highlighting.`,
    inputFormat: isStandaloneRHash
      ? '[#]w# (starts at leading # for standalone R_#)'
      : '#w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: workAlpha,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: isStandaloneRHash ? 'leading-blank' : 'trailing-blank',
    ...compiled,
    schemaDiagram,
    sampleInputs: [],
    isCustom: true,
  };

  const candidateInputs = isStandaloneRHash
    ? [
        { label: 'Single word', input: '#abc#' },
        { label: 'Two words', input: '#ab#cd#' },
        { label: 'Unary III', input: '#III#' },
      ]
    : [
        { label: 'Word abc', input: '#abc#' },
        { label: 'Two words', input: '#a#bc#' },
        { label: 'Unary II', input: '#II#' },
        { label: 'Binary 101', input: '#101#' },
        { label: 'Empty ε', input: '#' },
      ];

  const canonicalSamples: SampleInput[] = [];
  const fallbackSamples: SampleInput[] = [];
  for (const cand of candidateInputs) {
    const trace = runSimulation(machine, cand.input, 5000);
    if (trace.status === 'step-limit') continue;
    const sample: SampleInput = {
      label: cand.label,
      input: cand.input,
      expectedOutput: trace.output,
    };
    if (trace.headAtCanonicalEnd) {
      canonicalSamples.push(sample);
    } else {
      fallbackSamples.push(sample);
    }
  }

  machine.sampleInputs = (canonicalSamples.length > 0 ? canonicalSamples : fallbackSamples).slice(0, 4);
  return { ok: true, machine };
}

function buildParametricAnBnCn(rawSymbols: string): CompileResult {
  const parsed = parseSymbolList(rawSymbols, ['a', 'b', 'c']);
  if (!parsed.ok) return parsed;
  if (parsed.symbols.length !== 3) {
    return {
      ok: false,
      error: `xⁿyⁿzⁿ mode requires exactly 3 distinct symbols (got ${parsed.symbols.length}: ${parsed.symbols.join(', ')}).`,
    };
  }

  const [x, y, z] = parsed.symbols;
  const [mx, my, mz] = pickFreshMarkers(new Set(parsed.symbols), 3);
  const allWork = [x, y, z, mx, my, mz];

  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_rew' },
    { id: 'q_chk', label: 'Non-empty?', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_rewInit', label: 'To start ←', x: 0, y: 0, schemaNodeId: 'n_rew' },
    { id: 'q_findA', label: `Find ${x}`, x: 0, y: 0, schemaNodeId: 'n_markA' },
    { id: 'q_findB', label: `Find ${y}`, x: 0, y: 0, schemaNodeId: 'n_markB' },
    { id: 'q_findC', label: `Find ${z}`, x: 0, y: 0, schemaNodeId: 'n_markC' },
    { id: 'q_rew', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_markC' },
    { id: 'q_doneChk', label: `Only ${my},${mz}?`, x: 0, y: 0, schemaNodeId: 'n_check' },
    { id: 'q_wipeAcc', label: 'Clean (Ⓨ)', x: 0, y: 0, schemaNodeId: 'n_clean_acc' },
    { id: 'q_goEndRej', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_clean_rej' },
    { id: 'q_wipeRej', label: 'Clean (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_clean_rej' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];

  const transitions: TransitionRule[] = [
    makeRule('csl1', 'q0', '#', 'q_chk', '#', 'L'),
    makeRule('csl2', 'q_chk', '#', 'qH_rej', 'Ⓝ', 'R'),
    makeRule('csl3', 'q_chk', x, 'q_rewInit', x, 'L'),
    makeRule('csl4', 'q_chk', y, 'q_rewInit', y, 'L'),
    makeRule('csl5', 'q_chk', z, 'q_rewInit', z, 'L'),

    makeRule('csl6', 'q_rewInit', x, 'q_rewInit', x, 'L'),
    makeRule('csl7', 'q_rewInit', y, 'q_rewInit', y, 'L'),
    makeRule('csl8', 'q_rewInit', z, 'q_rewInit', z, 'L'),
    makeRule('csl9', 'q_rewInit', '#', 'q_findA', '#', 'R'),

    makeRule('csl10', 'q_findA', mx, 'q_findA', mx, 'R'),
    makeRule('csl11', 'q_findA', x, 'q_findB', mx, 'R'),
    makeRule('csl12', 'q_findA', my, 'q_doneChk', my, 'R'),
    makeRule('csl13', 'q_findA', y, 'q_goEndRej', mx, 'R'),
    makeRule('csl14', 'q_findA', z, 'q_goEndRej', mx, 'R'),
    makeRule('csl15', 'q_findA', mz, 'q_goEndRej', mx, 'R'),
    makeRule('csl16', 'q_findA', '#', 'q_wipeRej', '#', 'L'),

    makeRule('csl17', 'q_findB', x, 'q_findB', x, 'R'),
    makeRule('csl18', 'q_findB', my, 'q_findB', my, 'R'),
    makeRule('csl19', 'q_findB', y, 'q_findC', my, 'R'),
    makeRule('csl20', 'q_findB', z, 'q_goEndRej', mx, 'R'),
    makeRule('csl21', 'q_findB', mz, 'q_goEndRej', mx, 'R'),
    makeRule('csl22', 'q_findB', mx, 'q_goEndRej', mx, 'R'),
    makeRule('csl23', 'q_findB', '#', 'q_wipeRej', '#', 'L'),

    makeRule('csl24', 'q_findC', y, 'q_findC', y, 'R'),
    makeRule('csl25', 'q_findC', mz, 'q_findC', mz, 'R'),
    makeRule('csl26', 'q_findC', z, 'q_rew', mz, 'L'),
    makeRule('csl27', 'q_findC', x, 'q_goEndRej', mx, 'R'),
    makeRule('csl28', 'q_findC', mx, 'q_goEndRej', mx, 'R'),
    makeRule('csl29', 'q_findC', my, 'q_goEndRej', mx, 'R'),
    makeRule('csl30', 'q_findC', '#', 'q_wipeRej', '#', 'L'),

    ...allWork.map((s, idx) => makeRule(`csl_rew_${idx}`, 'q_rew', s, 'q_rew', s, 'L')),
    makeRule('csl31', 'q_rew', '#', 'q_findA', '#', 'R'),

    makeRule('csl32', 'q_doneChk', my, 'q_doneChk', my, 'R'),
    makeRule('csl33', 'q_doneChk', mz, 'q_doneChk', mz, 'R'),
    makeRule('csl34', 'q_doneChk', x, 'q_goEndRej', mx, 'R'),
    makeRule('csl35', 'q_doneChk', y, 'q_goEndRej', mx, 'R'),
    makeRule('csl36', 'q_doneChk', z, 'q_goEndRej', mx, 'R'),
    makeRule('csl37', 'q_doneChk', mx, 'q_goEndRej', mx, 'R'),
    makeRule('csl38', 'q_doneChk', '#', 'q_wipeAcc', '#', 'L'),

    ...[mx, my, mz].map((s, idx) =>
      makeRule(`csl_wa_${idx}`, 'q_wipeAcc', s, 'q_wipeAcc', '#', 'L'),
    ),
    makeRule('csl39', 'q_wipeAcc', '#', 'qH_acc', 'Ⓨ', 'R'),

    ...allWork.map((s, idx) => makeRule(`csl_ge_${idx}`, 'q_goEndRej', s, 'q_goEndRej', mx, 'R')),
    makeRule('csl40', 'q_goEndRej', '#', 'q_wipeRej', '#', 'L'),
    ...allWork.map((s, idx) => makeRule(`csl_wr_${idx}`, 'q_wipeRej', s, 'q_wipeRej', '#', 'L')),
    makeRule('csl41', 'q_wipeRej', '#', 'qH_rej', 'Ⓝ', 'R'),
  ];

  return {
    ok: true,
    machine: {
      id: `compiled-csl-${x}${y}${z}-${Date.now().toString(36)}`,
      name: `Context-Sensitive ${x}ⁿ${y}ⁿ${z}ⁿ (n ≥ 1)`,
      category: 'classic-tm',
      kind: 'decider',
      description: `Decides the context-sensitive language { ${x}ⁿ${y}ⁿ${z}ⁿ | n ≥ 1 }, outputting #Ⓨ# or #Ⓝ#.`,
      algorithmSummary: `Iteratively marks one ${x} → ${mx}, one ${y} → ${my}, and one ${z} → ${mz} per sweep. Once all ${x}s are marked, verifies only ${my} and ${mz} remain, erases all markers, and outputs #Ⓨ# (or #Ⓝ# on any mismatch).`,
      inputFormat: `#w# with w ∈ {${x}, ${y}, ${z}}* (e.g., #${x}${x}${y}${y}${z}${z}#)`,
      blankSymbol: '#',
      inputAlphabet: [x, y, z],
      tapeAlphabet: ['#', x, y, z, mx, my, mz, 'Ⓨ', 'Ⓝ'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH_acc', 'qH_rej'],
      states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 185, rowGap: 110 }),
      transitions,
      schemaDiagram: {
        title: `${x}ⁿ${y}ⁿ${z}ⁿ Decider — L&P Schema`,
        width: 760,
        height: 430,
        nodes: [
          { id: 'n_rew', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 130 },
          { id: 'n_markA', label: `${mx} R`, kind: 'write', x: 280, y: 130 },
          { id: 'n_markB', label: `${my} R`, kind: 'write', x: 470, y: 130 },
          { id: 'n_markC', label: `${mz} L_#`, kind: 'builtin', builtinId: 'L_hash', x: 660, y: 130 },
          { id: 'n_check', label: 'R_#', kind: 'builtin', builtinId: 'R_hash', x: 280, y: 260 },
          { id: 'n_clean_acc', label: 'E', kind: 'builtin', builtinId: 'E', x: 280, y: 370 },
          { id: 'n_accept', label: 'Ⓨ R', kind: 'halt', variant: 'accept', x: 470, y: 370 },
          { id: 'n_clean_rej', label: 'E', kind: 'builtin', builtinId: 'E', x: 470, y: 260 },
          { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: 660, y: 260 },
        ],
        edges: [
          { id: 'e_rew', from: 'n_rew', to: 'n_markA', label: 'R' },
          { id: 'e_emp', from: 'n_rew', to: 'n_reject', label: '#' },
          { id: 'e_ab', from: 'n_markA', to: 'n_markB', label: x },
          { id: 'e_bc', from: 'n_markB', to: 'n_markC', label: y },
          { id: 'e_loop', from: 'n_markC', to: 'n_markA', label: z, curveOffset: -66 },
          { id: 'e_chk', from: 'n_markA', to: 'n_check', label: my },
          { id: 'e_badA', from: 'n_markA', to: 'n_clean_rej', label: '≠' },
          { id: 'e_badB', from: 'n_markB', to: 'n_clean_rej', label: '≠' },
          { id: 'e_badC', from: 'n_markC', to: 'n_clean_rej', label: '≠' },
          { id: 'e_cacc', from: 'n_check', to: 'n_clean_acc', label: '#' },
          { id: 'e_crej', from: 'n_check', to: 'n_clean_rej', label: '≠' },
          { id: 'e_acc', from: 'n_clean_acc', to: 'n_accept', label: '#' },
          { id: 'e_rej', from: 'n_clean_rej', to: 'n_reject', label: '#' },
        ],
      },
      sampleInputs: [
        { label: `${x}²${y}²${z}² (Accept)`, input: `#${x}${x}${y}${y}${z}${z}#`, expectedOutput: '#Ⓨ#', verdict: 'accept' },
        { label: `${x}${y}${z} (Accept)`, input: `#${x}${y}${z}#`, expectedOutput: '#Ⓨ#', verdict: 'accept' },
        { label: `${x}²${y}²${z} (Reject)`, input: `#${x}${x}${y}${y}${z}#`, expectedOutput: '#Ⓝ#', verdict: 'reject' },
        { label: `${x}${y}${z}${x}${y}${z} (Reject)`, input: `#${x}${y}${z}${x}${y}${z}#`, expectedOutput: '#Ⓝ#', verdict: 'reject' },
        { label: 'Empty (Reject)', input: '#', expectedOutput: '#Ⓝ#', verdict: 'reject' },
      ],
      isCustom: true,
    },
  };
}

function buildParametricReverse(rawSymbols: string): CompileResult {
  const parsed = parseSymbolList(rawSymbols, ['0', '1']);
  if (!parsed.ok) return parsed;
  const sigma = parsed.symbols;
  if (sigma.length > 8) {
    return { ok: false, error: 'Reversal supports at most 8 distinct symbols.' };
  }
  const [marker] = pickFreshMarkers(new Set(sigma), 1);

  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_pick' },
    { id: 'q_pick', label: 'Pick sym ←', x: 0, y: 0, schemaNodeId: 'n_pick' },
    ...sigma.flatMap((s) => [
      { id: `q_cIn_${s}`, label: `Carry ${s} →`, x: 0, y: 0, schemaNodeId: 'n_carry' },
      { id: `q_cOut_${s}`, label: `Write ${s} →`, x: 0, y: 0, schemaNodeId: 'n_carry' },
    ]),
    { id: 'q_retOut', label: 'Back out ←', x: 0, y: 0, schemaNodeId: 'n_ret' },
    { id: 'q_wipeX', label: `Wipe ${marker} →`, x: 0, y: 0, schemaNodeId: 'n_wipe' },
    { id: 'q_scanEnd', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_end' },
    { id: 'qH', label: 'Halt', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_end' },
  ];

  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`rv${rid++}`, from, read, to, write, move));
  };

  add('q0', '#', 'q_pick', '#', 'L');
  add('q_pick', marker, 'q_pick', marker, 'L');
  add('q_pick', '#', 'q_wipeX', '#', 'R');

  for (const s of sigma) {
    add('q_pick', s, `q_cIn_${s}`, marker, 'R');
    add(`q_cIn_${s}`, marker, `q_cIn_${s}`, marker, 'R');
    add(`q_cIn_${s}`, '#', `q_cOut_${s}`, '#', 'R');
    for (const a of sigma) {
      add(`q_cOut_${s}`, a, `q_cOut_${s}`, a, 'R');
    }
    add(`q_cOut_${s}`, '#', 'q_retOut', s, 'L');
    add('q_retOut', s, 'q_retOut', s, 'L');
  }
  add('q_retOut', '#', 'q_pick', '#', 'L');

  add('q_wipeX', marker, 'q_wipeX', '#', 'R');
  add('q_wipeX', '#', 'q_scanEnd', '#', 'R');
  for (const s of sigma) {
    add('q_scanEnd', s, 'q_scanEnd', s, 'R');
  }
  add('q_scanEnd', '#', 'qH', '#', 'S');

  const w1 = sigma.length >= 2 ? `${sigma[0]}${sigma[1]}${sigma[0]}${sigma[0]}` : `${sigma[0]}${sigma[0]}`;
  const w1Rev = Array.from(w1).reverse().join('');
  const w2 = sigma.length >= 2 ? `${sigma[1]}${sigma[0]}` : sigma[0];
  const w2Rev = Array.from(w2).reverse().join('');

  return {
    ok: true,
    machine: {
      id: `compiled-reverse-${Date.now().toString(36)}`,
      name: `String Reversal (wᴿ over {${sigma.join(', ')}})`,
      category: 'classic-tm',
      kind: 'transducer',
      description: `Reverses any string #w# over {${sigma.join(', ')}}* into #wᴿ#.`,
      algorithmSummary: `Copies each symbol of w from right to left (marking consumed cells as ${marker}) into a new block right of #, then erases ${marker} markers and parks at the trailing # after wᴿ.`,
      inputFormat: `#w# with w ∈ {${sigma.join(', ')}}* (e.g., #${w1}# → #${w1Rev}#)`,
      blankSymbol: '#',
      inputAlphabet: sigma,
      tapeAlphabet: ['#', ...sigma, marker],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH'],
      states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 180, rowGap: 110 }),
      transitions,
      schemaDiagram: {
        title: `String Reversal (wᴿ) — L&P Schema`,
        width: 640,
        height: 335,
        nodes: [
          { id: 'n_pick', label: '> L', kind: 'start-action', x: 105, y: 135 },
          { id: 'n_carry', label: 'R_# R_# σ', kind: 'builtin', builtinId: 'R_hash', x: 315, y: 135 },
          { id: 'n_ret', label: 'L_#', kind: 'builtin', builtinId: 'L_hash', x: 525, y: 135 },
          { id: 'n_wipe', label: '# R', kind: 'write', x: 105, y: 265 },
          { id: 'n_end', label: 'R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 315, y: 265 },
        ],
        edges: [
          { id: 'e_pick', from: 'n_pick', to: 'n_carry', label: `σ → ${marker}` },
          { id: 'e_ret', from: 'n_carry', to: 'n_ret', label: 'σ' },
          { id: 'e_loop', from: 'n_ret', to: 'n_pick', label: '#', curveOffset: -66 },
          { id: 'e_done', from: 'n_pick', to: 'n_wipe', label: '#' },
          { id: 'e_end', from: 'n_wipe', to: 'n_end', label: '#' },
        ],
      },
      sampleInputs: [
        { label: `rev(${w1}) = ${w1Rev}`, input: `#${w1}#`, expectedOutput: `#${w1Rev}#` },
        { label: `rev(${w2}) = ${w2Rev}`, input: `#${w2}#`, expectedOutput: `#${w2Rev}#` },
        { label: 'Empty ε', input: '#', expectedOutput: '#' },
      ],
      isCustom: true,
    },
  };
}

function buildParametricCopyEq(rawSymbols: string): CompileResult {
  const parsed = parseSymbolList(rawSymbols, ['0', '1']);
  if (!parsed.ok) return parsed;
  const sigma = parsed.symbols;
  if (sigma.length > 8) {
    return { ok: false, error: 'w#w decider supports at most 8 distinct symbols.' };
  }
  const [markerX, markerS] = pickFreshMarkers(new Set(sigma), 2);
  const allWork = [...sigma, markerX, markerS];

  const rawStates: StateNode[] = [
    { id: 'q0', label: 'Start', x: 0, y: 0, isStart: true, schemaNodeId: 'n_init' },
    { id: 'q_chkW2', label: 'Check w₂', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_w2E', label: 'w₂ empty', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_rewW2', label: 'Rew w₂ ←', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_chkW1', label: 'Check w₁', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_rewW1', label: 'Rew w₁ ←', x: 0, y: 0, schemaNodeId: 'n_init' },
    { id: 'q_pick', label: 'Pick w₁', x: 0, y: 0, schemaNodeId: 'n_pick' },
    ...sigma.flatMap((s) => [
      { id: `q_c_${s}`, label: `Carry ${s} →`, x: 0, y: 0, schemaNodeId: 'n_match' },
      { id: `q_m_${s}`, label: `Match ${s}`, x: 0, y: 0, schemaNodeId: 'n_match' },
    ]),
    { id: 'q_back', label: 'Rewind ←', x: 0, y: 0, schemaNodeId: 'n_back' },
    { id: 'q_chkEnd', label: 'w₂ done?', x: 0, y: 0, schemaNodeId: 'n_chkEnd' },
    { id: 'q_wipeAcc', label: 'Clean (Ⓨ)', x: 0, y: 0, schemaNodeId: 'n_clean_acc' },
    { id: 'q_goEndRej', label: 'To end →', x: 0, y: 0, schemaNodeId: 'n_clean_rej' },
    { id: 'q_wipeRej', label: 'Clean (Ⓝ)', x: 0, y: 0, schemaNodeId: 'n_clean_rej' },
    { id: 'qH_acc', label: 'Accept Ⓨ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_accept' },
    { id: 'qH_rej', label: 'Reject Ⓝ', x: 0, y: 0, isHalt: true, schemaNodeId: 'n_reject' },
  ];

  const transitions: TransitionRule[] = [];
  let rid = 0;
  const add = (from: string, read: string, to: string, write: string, move: 'L' | 'R' | 'S') => {
    transitions.push(makeRule(`ce${rid++}`, from, read, to, write, move));
  };

  add('q0', '#', 'q_chkW2', '#', 'L');
  add('q_chkW2', '#', 'q_w2E', '#', 'L');
  add('q_w2E', '#', 'qH_acc', 'Ⓨ', 'R');
  add('q_rewW2', '#', 'q_chkW1', markerS, 'L');
  add('q_chkW1', '#', 'q_goEndRej', '#', 'R');
  add('q_rewW1', '#', 'q_pick', '#', 'R');

  add('q_pick', markerX, 'q_pick', markerX, 'R');
  add('q_pick', markerS, 'q_chkEnd', markerS, 'R');

  for (const s of sigma) {
    add('q_chkW2', s, 'q_rewW2', s, 'L');
    add('q_w2E', s, 'q_wipeRej', '#', 'L');
    add('q_rewW2', s, 'q_rewW2', s, 'L');
    add('q_chkW1', s, 'q_rewW1', s, 'L');
    add('q_rewW1', s, 'q_rewW1', s, 'L');

    add('q_pick', s, `q_c_${s}`, markerX, 'R');

    for (const a of sigma) {
      add(`q_c_${s}`, a, `q_c_${s}`, a, 'R');
      add(`q_m_${s}`, a, a === s ? 'q_back' : 'q_goEndRej', markerX, a === s ? 'L' : 'R');
    }
    add(`q_c_${s}`, markerS, `q_m_${s}`, markerS, 'R');
    add(`q_m_${s}`, markerX, `q_m_${s}`, markerX, 'R');
    add(`q_m_${s}`, '#', 'q_wipeRej', '#', 'L');

    add('q_chkEnd', s, 'q_goEndRej', markerX, 'R');
  }

  for (const s of allWork) {
    add('q_back', s, 'q_back', s, 'L');
    add('q_goEndRej', s, 'q_goEndRej', markerX, 'R');
    add('q_wipeRej', s, 'q_wipeRej', '#', 'L');
  }
  add('q_back', '#', 'q_pick', '#', 'R');
  add('q_goEndRej', '#', 'q_wipeRej', '#', 'L');
  add('q_wipeRej', '#', 'qH_rej', 'Ⓝ', 'R');

  add('q_chkEnd', markerX, 'q_chkEnd', markerX, 'R');
  add('q_chkEnd', '#', 'q_wipeAcc', '#', 'L');
  add('q_wipeAcc', markerX, 'q_wipeAcc', '#', 'L');
  add('q_wipeAcc', markerS, 'q_wipeAcc', '#', 'L');
  add('q_wipeAcc', '#', 'qH_acc', 'Ⓨ', 'R');

  const sampleW = sigma.length >= 2 ? `${sigma[0]}${sigma[1]}${sigma[0]}` : `${sigma[0]}${sigma[0]}`;
  const sampleDiff = sigma.length >= 2 ? `${sigma[0]}${sigma[1]}${sigma[1]}` : `${sigma[0]}`;

  return {
    ok: true,
    machine: {
      id: `compiled-copy-eq-${Date.now().toString(36)}`,
      name: `Copy-Equality Decider (w#w over {${sigma.join(', ')}})`,
      category: 'classic-tm',
      kind: 'decider',
      description: `Decides { w#w | w ∈ {${sigma.join(', ')}}* }, outputting #Ⓨ# or #Ⓝ#.`,
      algorithmSummary: `Marks separator # as ${markerS} and matches w₁ against w₂ symbol-by-symbol from left to right using marker ${markerX}. Cleans all markers and outputs #Ⓨ# on exact match or #Ⓝ# on any mismatch.`,
      inputFormat: `#w₁#w₂# with w₁, w₂ ∈ {${sigma.join(', ')}}* (e.g., #${sampleW}#${sampleW}#)`,
      blankSymbol: '#',
      inputAlphabet: sigma,
      tapeAlphabet: ['#', ...allWork, 'Ⓨ', 'Ⓝ'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH_acc', 'qH_rej'],
      states: autoLayoutStates(rawStates, transitions, 'q0', { colGap: 180, rowGap: 110 }),
      transitions,
      schemaDiagram: {
        title: `Copy-Equality (w#w) — L&P Schema`,
        width: 775,
        height: 430,
        nodes: [
          { id: 'n_init', label: `> L_# ${markerS} L_#`, kind: 'start-action', builtinId: 'L_hash', x: 105, y: 125 },
          { id: 'n_pick', label: 'R', kind: 'move', x: 295, y: 125 },
          { id: 'n_match', label: 'R_# σ?', kind: 'builtin', builtinId: 'R_hash', x: 485, y: 125 },
          { id: 'n_back', label: 'L_#', kind: 'builtin', builtinId: 'L_hash', x: 675, y: 125 },
          { id: 'n_chkEnd', label: 'R', kind: 'move', x: 295, y: 250 },
          { id: 'n_clean_acc', label: 'E', kind: 'builtin', builtinId: 'E', x: 295, y: 360 },
          { id: 'n_accept', label: 'Ⓨ R', kind: 'halt', variant: 'accept', x: 105, y: 360 },
          { id: 'n_clean_rej', label: 'E', kind: 'builtin', builtinId: 'E', x: 485, y: 250 },
          { id: 'n_reject', label: 'Ⓝ R', kind: 'halt', variant: 'reject', x: 675, y: 250 },
        ],
        edges: [
          { id: 'e_init', from: 'n_init', to: 'n_pick', label: 'R' },
          { id: 'e_emp_acc', from: 'n_init', to: 'n_accept', label: '###' },
          { id: 'e_emp_rej', from: 'n_init', to: 'n_clean_rej', label: '#w / w#' },
          { id: 'e_pm', from: 'n_pick', to: 'n_match', label: `σ → ${markerX}` },
          { id: 'e_mb', from: 'n_match', to: 'n_back', label: 'σ = σ' },
          { id: 'e_loop', from: 'n_back', to: 'n_pick', label: '#', curveOffset: -64 },
          { id: 'e_chk', from: 'n_pick', to: 'n_chkEnd', label: markerS },
          { id: 'e_mis', from: 'n_match', to: 'n_clean_rej', label: '≠' },
          { id: 'e_leftover', from: 'n_chkEnd', to: 'n_clean_rej', label: 'σ' },
          { id: 'e_cacc', from: 'n_chkEnd', to: 'n_clean_acc', label: '#' },
          { id: 'e_acc', from: 'n_clean_acc', to: 'n_accept', label: '#' },
          { id: 'e_rej', from: 'n_clean_rej', to: 'n_reject', label: '#' },
        ],
      },
      sampleInputs: [
        { label: `${sampleW} = ${sampleW} (Accept)`, input: `#${sampleW}#${sampleW}#`, expectedOutput: '#Ⓨ#', verdict: 'accept' },
        { label: `${sampleW} ≠ ${sampleDiff} (Reject)`, input: `#${sampleW}#${sampleDiff}#`, expectedOutput: '#Ⓝ#', verdict: 'reject' },
        { label: 'ε = ε (Accept)', input: '###', expectedOutput: '#Ⓨ#', verdict: 'accept' },
      ],
      isCustom: true,
    },
  };
}

export function compileDirectTm(spec: DirectTmSpec): CompileResult {
  switch (spec.mode) {
    case 'pipeline':
      return buildPipelineTm(spec);
    case 'anbncn':
      return buildParametricAnBnCn(spec.symbols);
    case 'reverse':
      return buildParametricReverse(spec.symbols);
    case 'copy-eq':
      return buildParametricCopyEq(spec.symbols);
    case 'custom':
      if (!spec.customMachine) {
        return { ok: false, error: 'No custom Turing Machine definition provided.' };
      }
      return { ok: true, machine: spec.customMachine };
  }
}
