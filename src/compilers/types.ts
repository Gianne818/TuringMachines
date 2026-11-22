import type { BuiltInId, TuringMachineDefinition } from '../engine/types';

export type ComposerCategory =
  | 'regular'
  | 'context-free'
  | 'unary-arithmetic'
  | 'binary-logic'
  | 'comparison'
  | 'direct-tm';

export interface RegularSpec {
  kind: 'regular';
  pattern: string;
}

export interface ContextFreeSpec {
  kind: 'context-free';
  grammar: string;
}

export type UnaryArithmeticOp =
  | 'monus'
  | 'add'
  | 'multiply'
  | 'divide'
  | 'modulo'
  | 'scale'
  | 'add-const'
  | 'sub-const';

export interface UnaryArithmeticSpec {
  kind: 'unary-arithmetic';
  op: UnaryArithmeticOp;
  constantK: number;
}

export type BinaryLogicOp =
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'NAND'
  | 'NOR'
  | 'XNOR'
  | 'IMPLIES'
  | 'CUSTOM'
  | 'NOT'
  | 'INC'
  | 'TWOS_COMP'
  | 'EVEN_PARITY'
  | 'ODD_PARITY';

export interface BinaryLogicSpec {
  kind: 'binary-logic';
  op: BinaryLogicOp;
  /** [f(0,0), f(0,1), f(1,0), f(1,1)] */
  customTable: [0 | 1, 0 | 1, 0 | 1, 0 | 1];
}

export type ComparisonDomain = 'unary' | 'binary';

export type ComparisonOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'three-way';

export interface ComparisonSpec {
  kind: 'comparison';
  domain: ComparisonDomain;
  op: ComparisonOp;
}

export type PipelineOp = BuiltInId | 'L' | 'R' | 'write';

export interface PipelineStep {
  id: string;
  op: PipelineOp;
  symbol?: string;
}

export type DirectTmMode =
  | 'pipeline'
  | 'anbncn'
  | 'reverse'
  | 'copy-eq'
  | 'custom';

export interface DirectTmSpec {
  kind: 'direct-tm';
  mode: DirectTmMode;
  pipeline: PipelineStep[];
  symbols: string;
  customMachine?: TuringMachineDefinition;
}

export type LanguageSpec =
  | RegularSpec
  | ContextFreeSpec
  | UnaryArithmeticSpec
  | BinaryLogicSpec
  | ComparisonSpec
  | DirectTmSpec;

export type CompileResult =
  | {
      ok: true;
      machine: TuringMachineDefinition;
      notes?: string;
      warning?: string;
    }
  | {
      ok: false;
      error: string;
    };
