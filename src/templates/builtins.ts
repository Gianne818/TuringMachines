import { MacroCompiler } from '../engine/macroCompiler';
import type { TuringMachineDefinition } from '../engine/types';

const WORK_ALPHA = ['a', 'b', 'c', 'd', 'I', '0', '1'];

function buildLHash(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createSeekBlank('L', 'n_L', ['L_#'], {
    step: 'n_L',
    scan: 'n_L',
  });
  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  block.connect(['#'], halt, 'S');
  const compiled = mc.finalize(block.entry, [halt]);

  return {
    id: 'builtin-l-hash',
    name: 'Scan Left (L_#)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Moves the tape head at least one cell left and continues scanning left until landing on a blank symbol (#).',
    algorithmSummary:
      'Step left once unconditionally (> L), then loop left while reading any non-blank symbol (σ ≠ #). Halt immediately upon encountering #.',
    inputFormat: '#w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'L_# — Scan Left to Blank',
      width: 460,
      height: 230,
      nodes: [
        { id: 'n_L', label: '> L', kind: 'start-action', x: 155, y: 140 },
        { id: 'n_halt', label: '#', sublabel: 'Halt on #', kind: 'halt', x: 330, y: 140 },
      ],
      edges: [
        {
          id: 'e_loop',
          from: 'n_L',
          to: 'n_L',
          label: 'σ ≠ #',
          isSelfLoop: true,
          loopAngleDeg: -90,
        },
        { id: 'e_halt', from: 'n_L', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Two words',
        input: '#ab#cd#',
        expectedOutput: '#ab#cd#',
        note: 'Starts at trailing # (index 6) and parks on middle separator # (index 3).',
      },
      {
        label: 'Single word',
        input: '#abc#',
        expectedOutput: '#abc#',
        note: 'Scans across abc and halts on leading # (index 0).',
      },
      {
        label: 'Empty tape',
        input: '#',
        expectedOutput: '#',
      },
    ],
  };
}

function buildRHash(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createSeekBlank('R', 'n_R', ['R_#'], {
    step: 'n_R',
    scan: 'n_R',
  });
  const halt = mc.newState('Halt', 'n_halt', ['Halt']);
  block.connect(['#'], halt, 'S');
  const compiled = mc.finalize(block.entry, [halt]);

  return {
    id: 'builtin-r-hash',
    name: 'Scan Right (R_#)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Moves the tape head at least one cell right and continues scanning right until landing on a blank symbol (#).',
    algorithmSummary:
      'Step right once unconditionally (> R), then loop right while reading any non-blank symbol (σ ≠ #). Halt immediately upon encountering #.',
    inputFormat: '[#]w# (demo starts at leading # so R_# crosses w to trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'leading-blank',
    ...compiled,
    schemaDiagram: {
      title: 'R_# — Scan Right to Blank',
      width: 460,
      height: 230,
      nodes: [
        { id: 'n_R', label: '> R', kind: 'start-action', x: 155, y: 140 },
        { id: 'n_halt', label: '#', sublabel: 'Halt on #', kind: 'halt', x: 330, y: 140 },
      ],
      edges: [
        {
          id: 'e_loop',
          from: 'n_R',
          to: 'n_R',
          label: 'σ ≠ #',
          isSelfLoop: true,
          loopAngleDeg: -90,
        },
        { id: 'e_halt', from: 'n_R', to: 'n_halt', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Single word',
        input: '#abc#',
        expectedOutput: '#abc#',
        note: 'Scans right across abc and halts on trailing #.',
      },
      {
        label: 'Two words',
        input: '#ab#cd#',
        expectedOutput: '#ab#cd#',
        note: 'Scans across ab and halts on separator #.',
      },
      {
        label: 'Unary tally',
        input: '#III#',
        expectedOutput: '#III#',
      },
    ],
  };
}

function buildShiftLeft(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createShiftLeft('n_R1', ['S_L'], {
    Lhash: 'n_Lhash',
    R1: 'n_R1',
    L: 'n_shift',
    sigma: 'n_shift',
    R2: 'n_shift',
    Lend: 'n_end',
    blankEnd: 'n_end',
  });
  const halt = mc.newState('Halt', 'n_end', ['S_L', 'Halt']);
  block.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(block.entry, [halt], { colGap: 165, rowGap: 92 });

  return {
    id: 'builtin-shift-left',
    name: 'Shift Left (S_L)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Shifts the non-blank word immediately to the left of the head one cell leftward, closing a blank gap and parking the head on the trailing #.',
    algorithmSummary:
      'First runs L_# to reach the blank before the word, then moves R. For each non-blank σ, steps L, writes σ, moves R, and loops back to R. On #, steps L and erases the duplicated trailing cell to #.',
    inputFormat: '#u#v# or ##w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Shift Left (S_L) — Lewis & Papadimitriou',
      width: 520,
      height: 300,
      nodes: [
        { id: 'n_Lhash', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 95, y: 120 },
        { id: 'n_R1', label: 'R', kind: 'move', x: 225, y: 120 },
        { id: 'n_shift', label: 'L σ R', kind: 'write', x: 420, y: 120 },
        { id: 'n_end', label: 'L #', sublabel: 'Halt', kind: 'halt', x: 225, y: 235 },
      ],
      edges: [
        { id: 'e_1', from: 'n_Lhash', to: 'n_R1' },
        { id: 'e_sigma', from: 'n_R1', to: 'n_shift', label: 'σ ≠ #' },
        { id: 'e_loop', from: 'n_shift', to: 'n_R1', curveOffset: -64 },
        { id: 'e_hash', from: 'n_R1', to: 'n_end', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Close separator gap',
        input: '#a#bc#',
        expectedOutput: '#abc#',
      },
      {
        label: 'Shift over blank',
        input: '##III#',
        expectedOutput: '#III#',
      },
      {
        label: 'Merge tallies',
        input: '#I#II#',
        expectedOutput: '#III#',
      },
    ],
  };
}

function buildShiftRight(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createShiftRight('n_L1', ['S_R'], {
    L1: 'n_L1',
    R: 'n_shift',
    sigma: 'n_shift',
    L2: 'n_shift',
    Rend: 'n_end',
    blankEnd: 'n_end',
    Rhash: 'n_end',
  });
  const halt = mc.newState('Halt', 'n_end', ['S_R', 'Halt']);
  block.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(block.entry, [halt], { colGap: 165, rowGap: 92 });

  return {
    id: 'builtin-shift-right',
    name: 'Shift Right (S_R)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Shifts the non-blank word immediately to the left of the head one cell rightward, inserting a blank # before it and returning to the trailing #.',
    algorithmSummary:
      'Starts with L. While reading non-blank σ, steps R, writes σ, steps L, and loops back to L. Upon hitting #, moves R, writes #, and runs R_# back to the trailing #.',
    inputFormat: '#w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Shift Right (S_R) — Lewis & Papadimitriou',
      width: 470,
      height: 300,
      nodes: [
        { id: 'n_L1', label: '> L', kind: 'start-action', x: 140, y: 120 },
        { id: 'n_shift', label: 'R σ L', kind: 'write', x: 355, y: 120 },
        { id: 'n_end', label: 'R # R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 140, y: 235 },
      ],
      edges: [
        { id: 'e_sigma', from: 'n_L1', to: 'n_shift', label: 'σ ≠ #' },
        { id: 'e_loop', from: 'n_shift', to: 'n_L1', curveOffset: -64 },
        { id: 'e_hash', from: 'n_L1', to: 'n_end', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Insert blank gap',
        input: '#a#bc#',
        expectedOutput: '#a##bc#',
      },
      {
        label: 'Shift right 1 cell',
        input: '#abc#',
        expectedOutput: '#abc#',
        note: 'Shifts abc from indices 1..3 to 2..4, inserting a # at index 1.',
      },
      {
        label: 'Empty tape',
        input: '#',
        expectedOutput: '#',
      },
    ],
  };
}

function buildErase(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createErase('n_L', ['E'], {
    L: 'n_L',
    writeBlank: 'n_blank',
    R: 'n_R',
  });
  const halt = mc.newState('Halt', 'n_R', ['E', 'Halt']);
  block.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(block.entry, [halt]);

  return {
    id: 'builtin-erase',
    name: 'Erase (E)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Erases the non-blank word immediately to the left of the head back to blank symbols (#) and halts one cell right of the preceding #.',
    algorithmSummary:
      'Starts with L. While reading σ ≠ #, writes # and loops back to L. Once # is reached, moves R once and halts.',
    inputFormat: '#w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Erase (E) — Lewis & Papadimitriou',
      width: 450,
      height: 300,
      nodes: [
        { id: 'n_L', label: '> L', kind: 'start-action', x: 155, y: 120 },
        { id: 'n_blank', label: '#', kind: 'write', x: 335, y: 120 },
        { id: 'n_R', label: 'R', sublabel: 'Halt', kind: 'halt', x: 155, y: 235 },
      ],
      edges: [
        { id: 'e_sigma', from: 'n_L', to: 'n_blank', label: 'σ ≠ #' },
        { id: 'e_loop', from: 'n_blank', to: 'n_L', curveOffset: -58 },
        { id: 'e_hash', from: 'n_L', to: 'n_R', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Erase word',
        input: '#abc#',
        expectedOutput: '#',
      },
      {
        label: 'Erase unary tally',
        input: '#III#',
        expectedOutput: '#',
      },
      {
        label: 'Erase right block only',
        input: '#a#bc#',
        expectedOutput: '#a#',
      },
    ],
  };
}

function buildCopy(): TuringMachineDefinition {
  const mc = new MacroCompiler(WORK_ALPHA);
  const block = mc.createCopy('n_R', ['C'], {
    Lhash: 'n_Lhash',
    R: 'n_R',
    mark: 'n_body',
    r1: 'n_body',
    r2: 'n_body',
    w1: 'n_body',
    l1: 'n_body',
    l2: 'n_body',
    w2: 'n_body',
    end: 'n_end',
  });
  const halt = mc.newState('Halt', 'n_end', ['C', 'Halt']);
  block.connect(mc.fullAlphabet, halt, 'S');
  const compiled = mc.finalize(block.entry, [halt], { colGap: 150, rowGap: 72 });

  return {
    id: 'builtin-copy',
    name: 'Copy (C)',
    category: 'builtin',
    kind: 'builtin',
    description:
      'Duplicates the word w to the left of the head as #w#w#, leaving the head parked at the trailing # after the copy.',
    algorithmSummary:
      'Seeks left (L_#), then steps R across each σ ≠ #: erases σ to #, jumps two blocks right (R_# → R_#), writes σ, jumps two blocks left (L_# → L_#), restores σ, and loops to R. When # is reached, runs R_# to park after the copy.',
    inputFormat: '#w# (with head at trailing #)',
    blankSymbol: '#',
    inputAlphabet: WORK_ALPHA,
    tapeAlphabet: mc.fullAlphabet,
    initialHead: 'trailing-blank',
    ...compiled,
    schemaDiagram: {
      title: 'Copy (C) — #w# → #w#w#',
      width: 635,
      height: 310,
      nodes: [
        { id: 'n_Lhash', label: '> L_#', kind: 'start-action', builtinId: 'L_hash', x: 85, y: 125 },
        { id: 'n_R', label: 'R', kind: 'move', x: 205, y: 125 },
        { id: 'n_body', label: '# R_# R_# σ L_# L_# σ', kind: 'write', x: 475, y: 125 },
        { id: 'n_end', label: 'R_#', sublabel: 'Halt', kind: 'halt', builtinId: 'R_hash', x: 205, y: 245 },
      ],
      edges: [
        { id: 'e_1', from: 'n_Lhash', to: 'n_R' },
        { id: 'e_sigma', from: 'n_R', to: 'n_body', label: 'σ ≠ #' },
        { id: 'e_loop', from: 'n_body', to: 'n_R', curveOffset: -68 },
        { id: 'e_hash', from: 'n_R', to: 'n_end', label: '#' },
      ],
    },
    sampleInputs: [
      {
        label: 'Copy abc',
        input: '#abc#',
        expectedOutput: '#abc#abc#',
      },
      {
        label: 'Copy unary II',
        input: '#II#',
        expectedOutput: '#II#II#',
      },
      {
        label: 'Copy binary 101',
        input: '#101#',
        expectedOutput: '#101#101#',
      },
      {
        label: 'Empty word',
        input: '#',
        expectedOutput: '#',
      },
    ],
  };
}

export const BUILTIN_TEMPLATES: TuringMachineDefinition[] = [
  buildShiftLeft(),
  buildShiftRight(),
  buildCopy(),
  buildErase(),
  buildLHash(),
  buildRHash(),
];
