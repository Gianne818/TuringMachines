export type Direction = 'L' | 'R' | 'S';

export type MachineKind = 'decider' | 'transducer' | 'builtin';

export type TemplateCategory =
  | 'unary-arithmetic'
  | 'regular'
  | 'context-free'
  | 'binary-logic'
  | 'comparison'
  | 'classic-tm'
  | 'builtin';

export type BuiltInId = 'L_hash' | 'R_hash' | 'S_L' | 'S_R' | 'E' | 'C';

/**
 * Where the read/write head starts relative to the #w# normalized input:
 * - 'trailing-blank': #w[#]  (standard convention used across all machines)
 * - 'leading-blank':  [#]w#  (used for standalone R_# scan demo)
 * - 'first-symbol':   #[w]#  (supported for custom machines if chosen)
 */
export type InitialHeadMode = 'trailing-blank' | 'leading-blank' | 'first-symbol';

export interface TransitionRule {
  id: string;
  from: string;
  read: string;
  to: string;
  write: string;
  move: Direction;
}

export interface StateNode {
  id: string;
  label?: string;
  x: number;
  y: number;
  isStart?: boolean;
  isHalt?: boolean;
  /** Optional link to the higher-level Lewis & Papadimitriou schema node */
  schemaNodeId?: string;
  /** Human-readable macro execution trail, e.g. ["S_L", "L_#"] */
  macroPath?: string[];
}

export interface SchemaNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: 'start-action' | 'move' | 'write' | 'builtin' | 'halt' | 'branch';
  variant?: 'accept' | 'reject';
  builtinId?: BuiltInId;
  x: number;
  y: number;
}

export interface SchemaEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  curveOffset?: number;
  isSelfLoop?: boolean;
  loopAngleDeg?: number;
  fromAnchor?: 'top' | 'bottom' | 'left' | 'right';
  toAnchor?: 'top' | 'bottom' | 'left' | 'right';
}

export interface SchemaDiagram {
  title: string;
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  width?: number;
  height?: number;
}

export interface SampleInput {
  label: string;
  input: string;
  expectedOutput: string;
  verdict?: 'accept' | 'reject';
  note?: string;
}

export interface TuringMachineDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  kind: MachineKind;
  description: string;
  algorithmSummary: string;
  inputFormat: string;
  blankSymbol: string;
  inputAlphabet: string[];
  tapeAlphabet: string[];
  initialHead: InitialHeadMode;
  startState: string;
  haltStates: string[];
  states: StateNode[];
  transitions: TransitionRule[];
  schemaDiagram?: SchemaDiagram;
  sampleInputs: SampleInput[];
  isCustom?: boolean;
}

export interface ExecutionStep {
  step: number;
  state: string;
  prevState: string | null;
  appliedRule: TransitionRule | null;
  tape: Record<number, string>;
  minIndex: number;
  maxIndex: number;
  head: number;
  writtenIndex: number | null;
  activeSchemaNodeId?: string;
  macroPath?: string[];
  idString: string;
}

export type SimulationStatus =
  | 'ready'
  | 'accepted'
  | 'rejected'
  | 'halted'
  | 'step-limit';

export interface SimulationTrace {
  steps: ExecutionStep[];
  status: SimulationStatus;
  output: string;
  rawWord: string;
  headAtCanonicalEnd: boolean;
  totalSteps: number;
  normalizedInput: string;
}
