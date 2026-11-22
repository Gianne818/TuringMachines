import { compileUnaryArithmeticToTm } from './arithmeticToTm';
import { compileCfgToTm } from './cfgToTm';
import { compileComparisonToTm } from './comparisonToTm';
import { compileDirectTm } from './directToTm';
import { compileBinaryLogicToTm } from './logicToTm';
import { compileRegexToTm } from './regexToTm';
import type { CompileResult, ComposerCategory, LanguageSpec } from './types';

export const DEFAULT_SPECS: Record<ComposerCategory, LanguageSpec> = {
  regular: {
    kind: 'regular',
    pattern: '(a|b)*abb',
  },
  'context-free': {
    kind: 'context-free',
    grammar: 'S -> a S b | a b',
  },
  'unary-arithmetic': {
    kind: 'unary-arithmetic',
    op: 'monus',
    constantK: 2,
  },
  'binary-logic': {
    kind: 'binary-logic',
    op: 'XOR',
    customTable: [0, 1, 1, 0],
  },
  comparison: {
    kind: 'comparison',
    domain: 'binary',
    op: 'gt',
  },
  'direct-tm': {
    kind: 'direct-tm',
    mode: 'pipeline',
    pipeline: [
      { id: 'step-1', op: 'C' },
      { id: 'step-2', op: 'S_L' },
    ],
    symbols: 'a,b,c',
  },
};

export function compileLanguageSpec(spec: LanguageSpec): CompileResult {
  switch (spec.kind) {
    case 'regular':
      return compileRegexToTm(spec);
    case 'context-free':
      return compileCfgToTm(spec);
    case 'unary-arithmetic':
      return compileUnaryArithmeticToTm(spec);
    case 'binary-logic':
      return compileBinaryLogicToTm(spec);
    case 'comparison':
      return compileComparisonToTm(spec);
    case 'direct-tm':
      return compileDirectTm(spec);
  }
}

export {
  compileRegexToTm,
  compileCfgToTm,
  compileUnaryArithmeticToTm,
  compileBinaryLogicToTm,
  compileComparisonToTm,
  compileDirectTm,
};
export * from './types';
