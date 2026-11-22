import type { BuiltInId, TemplateCategory, TuringMachineDefinition } from '../engine/types';
import { BINARY_LOGIC_TEMPLATES } from './binaryLogic';
import { BUILTIN_TEMPLATES } from './builtins';
import { CLASSIC_TEMPLATES } from './classic';
import { COMPARISON_TEMPLATES } from './comparison';
import { CONTEXT_FREE_TEMPLATES } from './contextFree';
import { REGULAR_TEMPLATES } from './regular';
import { UNARY_ARITHMETIC_TEMPLATES } from './unaryArithmetic';

export const DEFAULT_TEMPLATE_ID = 'unary-monus';

export interface CategoryMeta {
  id: TemplateCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export const TEMPLATE_CATEGORIES: CategoryMeta[] = [
  {
    id: 'unary-arithmetic',
    label: 'Unary Arithmetic (I / #)',
    shortLabel: 'Unary Arithmetic',
    description: 'Tally computation over {I} separated by #',
  },
  {
    id: 'regular',
    label: 'Regular Languages',
    shortLabel: 'Regular',
    description: 'Deciders outputting #Ⓨ# or #Ⓝ#',
  },
  {
    id: 'context-free',
    label: 'Context-Free Languages',
    shortLabel: 'Context-Free',
    description: 'Non-regular deciders outputting #Ⓨ# or #Ⓝ#',
  },
  {
    id: 'binary-logic',
    label: 'Logical (Binary)',
    shortLabel: 'Binary Logic',
    description: 'Bitwise logic & binary arithmetic transducers',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    shortLabel: 'Comparison',
    description: 'Relational & equality Turing Machines',
  },
  {
    id: 'classic-tm',
    label: 'Direct / Context-Sensitive TM',
    shortLabel: 'Direct TM',
    description: 'Beyond CFL & general tape manipulation',
  },
  {
    id: 'builtin',
    label: 'Built-in Functions (L&P)',
    shortLabel: 'Built-in Functions',
    description: 'S_L, S_R, Copy, Erase, L_#, R_# primitives',
  },
];

export const ALL_TEMPLATES: TuringMachineDefinition[] = [
  ...UNARY_ARITHMETIC_TEMPLATES,
  ...REGULAR_TEMPLATES,
  ...CONTEXT_FREE_TEMPLATES,
  ...BINARY_LOGIC_TEMPLATES,
  ...COMPARISON_TEMPLATES,
  ...CLASSIC_TEMPLATES,
  ...BUILTIN_TEMPLATES,
];

export const BUILTIN_BY_ID: Record<BuiltInId, TuringMachineDefinition> = {
  S_L: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-shift-left')!,
  S_R: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-shift-right')!,
  C: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-copy')!,
  E: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-erase')!,
  L_hash: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-l-hash')!,
  R_hash: BUILTIN_TEMPLATES.find((m) => m.id === 'builtin-r-hash')!,
};

export function findTemplateById(id: string): TuringMachineDefinition {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? ALL_TEMPLATES[0];
}

export { BUILTIN_TEMPLATES };
