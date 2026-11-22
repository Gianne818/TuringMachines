import { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Binary,
  Blocks,
  Calculator,
  CheckCircle2,
  Cpu,
  GitBranch,
  Layers,
  Minus,
  PencilLine,
  Plus,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  BinaryLogicOp,
  ComparisonDomain,
  ComparisonOp,
  ComposerCategory,
  DirectTmMode,
  LanguageSpec,
  PipelineOp,
  PipelineStep,
  UnaryArithmeticOp,
} from '../compilers/types';
import type { TuringMachineDefinition } from '../engine/types';

export interface LanguageComposerProps {
  spec: LanguageSpec;
  onChangeSpec: (nextSpec: LanguageSpec, preferredSampleInput?: string) => void;
  activeMachine: TuringMachineDefinition;
  compileError: string | null;
  compileNotes?: string;
  compileWarning?: string;
  onOpenEditor: () => void;
  onOpenBuiltIns?: () => void;
}

const CATEGORIES: {
  id: ComposerCategory;
  label: string;
  icon: typeof GitBranch;
}[] = [
  { id: 'regular', label: 'Regular (Regex)', icon: GitBranch },
  { id: 'context-free', label: 'Context-Free (CFG)', icon: Layers },
  { id: 'unary-arithmetic', label: 'Unary Arithmetic', icon: Calculator },
  { id: 'binary-logic', label: 'Logical (Binary)', icon: Binary },
  { id: 'comparison', label: 'Comparison', icon: Scale },
  { id: 'direct-tm', label: 'Direct TM / L&P', icon: Cpu },
];

const REGEX_SYNTAX_CHIPS = ['|', '*', '+', '?', 'ε'] as const;

const REGEX_PRESETS: { label: string; pattern: string; sample: string }[] = [
  { label: 'Ends in 01', pattern: '(0|1)*01', sample: '#1101#' },
  { label: "Even a's", pattern: 'b*(ab*ab*)*', sample: '#aabbaa#' },
  { label: '(a|b)*abb', pattern: '(a|b)*abb', sample: '#aabb#' },
  { label: 'Divisible by 3', pattern: '(0|1(01*0)*1)+', sample: '#110#' },
];

const CFG_PRESETS: { label: string; grammar: string; sample: string }[] = [
  { label: 'aⁿbⁿ', grammar: 'S -> a S b | a b', sample: '#aaabbb#' },
  { label: 'aⁿb²ⁿ', grammar: 'S -> a S b b | a b b', sample: '#aabbbb#' },
  {
    label: 'Binary Palindrome',
    grammar: 'S -> 0 S 0 | 1 S 1 | 0 | 1 | ε',
    sample: '#101101#',
  },
  { label: 'Balanced ()', grammar: 'S -> ( S ) S | ε', sample: '#(()())#' },
  {
    label: 'Equal a & b',
    grammar: 'S -> a S b S | b S a S | ε',
    sample: '#abba#',
  },
  { label: 'a c⁺ b', grammar: 'S -> a C b\nC -> c C | c', sample: '#acccb#' },
];

const UNARY_OPS: { id: UnaryArithmeticOp; label: string; sample: string }[] = [
  { id: 'monus', label: 'Monus m ∸ n', sample: '#III#II#' },
  { id: 'add', label: 'Add m + n', sample: '#III#II#' },
  { id: 'multiply', label: 'Multiply m × n', sample: '#III#II#' },
  { id: 'divide', label: 'Quotient m ÷ n', sample: '#IIIIII#II#' },
  { id: 'modulo', label: 'Remainder m mod n', sample: '#IIIII#II#' },
  { id: 'scale', label: 'Scale k · n', sample: '#III#' },
  { id: 'add-const', label: 'Add k', sample: '#III#' },
  { id: 'sub-const', label: 'Subtract k', sample: '#IIIII#' },
];

const TWO_INPUT_GATES: { id: BinaryLogicOp; label: string }[] = [
  { id: 'AND', label: 'AND' },
  { id: 'OR', label: 'OR' },
  { id: 'XOR', label: 'XOR' },
  { id: 'NAND', label: 'NAND' },
  { id: 'NOR', label: 'NOR' },
  { id: 'XNOR', label: 'XNOR' },
  { id: 'IMPLIES', label: 'IMPLIES' },
  { id: 'CUSTOM', label: 'Custom Table' },
];

const ONE_INPUT_OPS: { id: BinaryLogicOp; label: string; sample: string }[] = [
  { id: 'NOT', label: 'NOT', sample: '#10110#' },
  { id: 'INC', label: 'Increment +1', sample: '#1011#' },
  { id: 'TWOS_COMP', label: "2's Complement", sample: '#1010#' },
  { id: 'EVEN_PARITY', label: 'Even Parity', sample: '#1011#' },
  { id: 'ODD_PARITY', label: 'Odd Parity', sample: '#1011#' },
];

const COMPARISON_OPS: { id: ComparisonOp; label: string }[] = [
  { id: 'eq', label: '= Equal' },
  { id: 'neq', label: '≠ Not Equal' },
  { id: 'gt', label: '> Greater' },
  { id: 'gte', label: '≥ Greater/Eq' },
  { id: 'lt', label: '< Less' },
  { id: 'lte', label: '≤ Less/Eq' },
  { id: 'three-way', label: '3-Way < = >' },
];

const DIRECT_MODES: { id: DirectTmMode; label: string }[] = [
  { id: 'pipeline', label: 'L&P Pipeline' },
  { id: 'anbncn', label: 'xⁿyⁿzⁿ' },
  { id: 'reverse', label: 'String Reversal' },
  { id: 'copy-eq', label: 'w#w Equality' },
  { id: 'custom', label: 'Custom Rules' },
];

const PIPELINE_PALETTE: {
  label: string;
  op: PipelineOp;
  symbol?: string;
}[] = [
  { label: 'S_L', op: 'S_L' },
  { label: 'S_R', op: 'S_R' },
  { label: 'C', op: 'C' },
  { label: 'E', op: 'E' },
  { label: 'L_#', op: 'L_hash' },
  { label: 'R_#', op: 'R_hash' },
  { label: 'L', op: 'L' },
  { label: 'R', op: 'R' },
  { label: 'Write #', op: 'write', symbol: '#' },
  { label: 'Write I', op: 'write', symbol: 'I' },
];

const PIPELINE_PRESETS: {
  label: string;
  steps: { op: PipelineOp; symbol?: string }[];
  symbols: string;
  sample: string;
}[] = [
  {
    label: 'Doubler: C → S_L',
    steps: [{ op: 'C' }, { op: 'S_L' }],
    symbols: 'I',
    sample: '#III#',
  },
  {
    label: 'Shift Left: S_L',
    steps: [{ op: 'S_L' }],
    symbols: 'I',
    sample: '#III#II#',
  },
  {
    label: 'Copy: C',
    steps: [{ op: 'C' }],
    symbols: 'I',
    sample: '#III#',
  },
  {
    label: 'Erase: E',
    steps: [{ op: 'E' }],
    symbols: 'I',
    sample: '#III#',
  },
];

function createStepId(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatPipelineStep(step: PipelineStep): string {
  if (step.op === 'L_hash') return 'L_#';
  if (step.op === 'R_hash') return 'R_#';
  if (step.op === 'write') return `Write ${step.symbol ?? '#'}`;
  return step.op;
}

function getUnaryFormulaPreview(op: UnaryArithmeticOp, k: number): string {
  switch (op) {
    case 'monus':
      return '#III#II# → #I#';
    case 'add':
      return '#III#II# → #IIIII#';
    case 'multiply':
      return '#III#II# → #IIIIII#';
    case 'divide':
      return '#IIIIII#II# → #III#';
    case 'modulo':
      return '#IIIII#II# → #I#';
    case 'scale':
      return `#III# → #${'I'.repeat(3 * k)}#`;
    case 'add-const':
      return `#III# → #${'I'.repeat(3 + k)}#`;
    case 'sub-const': {
      const rem = Math.max(0, 5 - k);
      return `#IIIII# → #${rem > 0 ? 'I'.repeat(rem) : ''}#`;
    }
  }
}

function getComparisonSample(domain: ComparisonDomain, op: ComparisonOp): string {
  if (domain === 'unary') {
    if (op === 'eq') return '#II#II#';
    if (op === 'lt' || op === 'lte') return '#II#III#';
    return '#III#II#';
  }
  if (op === 'eq') return '#101#101#';
  if (op === 'lt' || op === 'lte') return '#011#101#';
  return '#101#011#';
}

function getDefaultSpecForCategory(cat: ComposerCategory): {
  spec: LanguageSpec;
  sample: string;
} {
  switch (cat) {
    case 'regular':
      return {
        spec: { kind: 'regular', pattern: '(a|b)*abb' },
        sample: '#aabb#',
      };
    case 'context-free':
      return {
        spec: { kind: 'context-free', grammar: 'S -> a S b | a b' },
        sample: '#aaabbb#',
      };
    case 'unary-arithmetic':
      return {
        spec: { kind: 'unary-arithmetic', op: 'monus', constantK: 2 },
        sample: '#III#II#',
      };
    case 'binary-logic':
      return {
        spec: { kind: 'binary-logic', op: 'AND', customTable: [0, 0, 0, 1] },
        sample: '#101#110#',
      };
    case 'comparison':
      return {
        spec: { kind: 'comparison', domain: 'unary', op: 'gt' },
        sample: '#III#II#',
      };
    case 'direct-tm':
      return {
        spec: {
          kind: 'direct-tm',
          mode: 'pipeline',
          pipeline: [
            { id: createStepId(), op: 'C' },
            { id: createStepId(), op: 'S_L' },
          ],
          symbols: 'I',
        },
        sample: '#III#',
      };
  }
}

export function LanguageComposer({
  spec,
  onChangeSpec,
  activeMachine,
  compileError,
  compileNotes,
  compileWarning,
  onOpenEditor,
  onOpenBuiltIns,
}: LanguageComposerProps) {
  const prefersReducedMotion = useReducedMotion();
  const baseId = useId();
  const regexInputRef = useRef<HTMLInputElement | null>(null);
  const cfgTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tabRefs = useRef<Record<ComposerCategory, HTMLButtonElement | null>>({
    regular: null,
    'context-free': null,
    'unary-arithmetic': null,
    'binary-logic': null,
    comparison: null,
    'direct-tm': null,
  });

  const regexInputId = `${baseId}-regex`;
  const cfgTextareaId = `${baseId}-cfg`;
  const symbolsInputId = `${baseId}-symbols`;
  const compileErrorId = `${baseId}-compile-error`;

  const handleSelectCategory = (cat: ComposerCategory) => {
    if (cat === spec.kind) return;
    const { spec: nextSpec, sample } = getDefaultSpecForCategory(cat);
    onChangeSpec(nextSpec, sample);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = CATEGORIES.findIndex((c) => c.id === spec.kind);
    if (idx < 0) return;

    let nextIdx = idx;
    if (e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % CATEGORIES.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + CATEGORIES.length) % CATEGORIES.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = CATEGORIES.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const targetCat = CATEGORIES[nextIdx].id;
    handleSelectCategory(targetCat);
    tabRefs.current[targetCat]?.focus();
  };

  const insertAtCursor = <T extends HTMLInputElement | HTMLTextAreaElement>(
    el: T | null,
    currentValue: string,
    token: string,
    onApplyValue: (nextValue: string) => void,
  ) => {
    const start = el?.selectionStart ?? currentValue.length;
    const end = el?.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + token + currentValue.slice(end);
    onApplyValue(nextValue);

    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const kindLabel =
    activeMachine.kind === 'decider'
      ? 'Decider #Ⓨ# / #Ⓝ#'
      : activeMachine.kind === 'builtin'
        ? 'Built-in L&P'
        : 'Transducer #output#';

  const kindStyle =
    activeMachine.kind === 'decider'
      ? {
          backgroundColor: 'var(--accept-soft)',
          color: 'var(--accept)',
        }
      : {
          backgroundColor: 'var(--accent-soft)',
          color: 'var(--accent)',
        };

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border p-3.5 sm:p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Language Specification Composer"
    >
      {/* Top Category Pill Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Language specification categories"
          onKeyDown={handleTabKeyDown}
          className="flex flex-wrap items-center gap-1 rounded-xl border p-1"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = spec.kind === cat.id;
            return (
              <button
                key={cat.id}
                ref={(el) => {
                  tabRefs.current[cat.id] = el;
                }}
                id={`${baseId}-tab-${cat.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => handleSelectCategory(cat.id)}
                className="pressable relative flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="composer-cat-pill"
                    transition={
                      prefersReducedMotion
                        ? { duration: 0.08 }
                        : { type: 'spring', bounce: 0, duration: 0.28 }
                    }
                    className="absolute inset-0 rounded-lg shadow-sm"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-strong)',
                    }}
                  />
                )}
                <Icon
                  className="relative z-10 h-3.5 w-3.5 shrink-0"
                  style={{ color: active ? 'var(--accent)' : 'currentColor' }}
                  aria-hidden="true"
                />
                <span className="relative z-10 whitespace-nowrap">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Compiler Micro-Indicator */}
        <div className="hidden items-center gap-1.5 text-[11px] font-medium sm:flex" style={{ color: 'var(--ink-muted)' }}>
          <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <span>Spec → Live TM</span>
        </div>
      </div>

      {/* Category Body */}
      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${spec.kind}`}
        className="flex flex-col gap-2.5"
      >
        {/* 1. REGULAR (REGEX) */}
        {spec.kind === 'regular' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={regexInputId}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Regular Expression
                  </label>
                  <div className="flex items-center gap-1" role="group" aria-label="Insert regex syntax">
                    <span className="mr-0.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Insert:
                    </span>
                    {REGEX_SYNTAX_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          insertAtCursor(
                            regexInputRef.current,
                            spec.pattern,
                            chip,
                            (nextPattern) =>
                              onChangeSpec({ kind: 'regular', pattern: nextPattern }),
                          )
                        }
                        className="pressable min-h-7 min-w-7 rounded-lg border px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--ink-primary)',
                        }}
                        title={`Insert ${chip}`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  ref={regexInputRef}
                  id={regexInputId}
                  type="text"
                  value={spec.pattern}
                  onChange={(e) =>
                    onChangeSpec({ kind: 'regular', pattern: e.target.value })
                  }
                  placeholder="(a|b)*abb"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(compileError)}
                  aria-describedby={compileError ? compileErrorId : undefined}
                  className="min-h-10 w-full rounded-xl border px-3.5 py-2 text-sm font-semibold tracking-wide sm:text-base"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: compileError ? 'var(--reject)' : 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                Starter Presets:
              </span>
              {REGEX_PRESETS.map((preset) => {
                const isSelected = spec.pattern.trim() === preset.pattern;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChangeSpec(
                        { kind: 'regular', pattern: preset.pattern },
                        preset.sample,
                      )
                    }
                    className="pressable min-h-7 rounded-lg border px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--accent-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: isSelected
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: isSelected
                        ? 'var(--accent)'
                        : 'var(--ink-secondary)',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. CONTEXT-FREE (CFG) */}
        {spec.kind === 'context-free' && (
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={cfgTextareaId}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  Production Rules (one per line, e.g. S -&gt; a S b | a b)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['->', '|', 'ε'] as const).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() =>
                        insertAtCursor(
                          cfgTextareaRef.current,
                          spec.grammar,
                          sym === '->' ? ' -> ' : sym,
                          (nextGrammar) =>
                            onChangeSpec({ kind: 'context-free', grammar: nextGrammar }),
                        )
                      }
                      className="pressable min-h-7 min-w-7 rounded-lg border px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--ink-primary)',
                      }}
                      title={`Insert ${sym}`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                ref={cfgTextareaRef}
                id={cfgTextareaId}
                rows={3}
                value={spec.grammar}
                onChange={(e) =>
                  onChangeSpec({ kind: 'context-free', grammar: e.target.value })
                }
                placeholder={'S -> a S b | a b'}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(compileError)}
                aria-describedby={compileError ? compileErrorId : undefined}
                className="w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: compileError ? 'var(--reject)' : 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                CFG Presets:
              </span>
              {CFG_PRESETS.map((preset) => {
                const isSelected = spec.grammar.trim() === preset.grammar.trim();
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChangeSpec(
                        { kind: 'context-free', grammar: preset.grammar },
                        preset.sample,
                      )
                    }
                    className="pressable min-h-7 rounded-lg border px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--accent-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: isSelected
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: isSelected
                        ? 'var(--accent)'
                        : 'var(--ink-secondary)',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {(compileNotes || compileWarning) && !compileError && (
              <div className="flex flex-wrap items-center gap-2">
                {compileNotes && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--accent)',
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{compileNotes}</span>
                  </span>
                )}
                {compileWarning && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--halt-soft)',
                      borderColor: 'var(--halt)',
                      color: 'var(--halt)',
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{compileWarning}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. UNARY ARITHMETIC */}
        {spec.kind === 'unary-arithmetic' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Unary arithmetic operations">
              {UNARY_OPS.map((item) => {
                const isSelected = spec.op === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChangeSpec(
                        { ...spec, op: item.id },
                        item.sample,
                      )
                    }
                    className="pressable min-h-8 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--accent)'
                        : 'var(--bg-elevated)',
                      borderColor: isSelected
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: isSelected
                        ? 'var(--accent-ink)'
                        : 'var(--ink-secondary)',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {(spec.op === 'scale' ||
                spec.op === 'add-const' ||
                spec.op === 'sub-const') && (
                <div
                  className="flex items-center gap-1 rounded-xl border p-1"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSpec({
                        ...spec,
                        constantK: Math.max(1, spec.constantK - 1),
                      })
                    }
                    disabled={spec.constantK <= 1}
                    aria-label="Decrease constant k"
                    className="pressable flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span
                    className="min-w-[48px] text-center text-xs font-bold tabular-nums"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    k = {spec.constantK}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSpec({
                        ...spec,
                        constantK: Math.min(5, spec.constantK + 1),
                      })
                    }
                    disabled={spec.constantK >= 5}
                    aria-label="Increase constant k"
                    className="pressable flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              <div
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <span style={{ color: 'var(--ink-muted)' }}>Example:</span>
                <span className="font-semibold tracking-wide" style={{ color: 'var(--ink-primary)' }}>
                  {getUnaryFormulaPreview(spec.op, spec.constantK)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4. LOGICAL (BINARY) */}
        {spec.kind === 'binary-logic' && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.25fr_1fr]">
              {/* 2-Input Gates */}
              <div
                className="flex flex-col gap-1.5 rounded-xl border p-2.5"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                  2-Input Bitwise Gates (#A#B#)
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="2-input binary gates">
                  {TWO_INPUT_GATES.map((gate) => {
                    const isSelected = spec.op === gate.id;
                    return (
                      <button
                        key={gate.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          onChangeSpec(
                            { ...spec, op: gate.id },
                            '#101#110#',
                          )
                        }
                        className="pressable min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--bg-surface)',
                          borderColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--border-subtle)',
                          color: isSelected
                            ? 'var(--accent-ink)'
                            : 'var(--ink-primary)',
                        }}
                      >
                        {gate.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1-Input Ops */}
              <div
                className="flex flex-col gap-1.5 rounded-xl border p-2.5"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                  1-Input Bitwise & Arithmetic Ops (#w#)
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="1-input binary operations">
                  {ONE_INPUT_OPS.map((op) => {
                    const isSelected = spec.op === op.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          onChangeSpec(
                            { ...spec, op: op.id },
                            op.sample,
                          )
                        }
                        className="pressable min-h-8 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--bg-surface)',
                          borderColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--border-subtle)',
                          color: isSelected
                            ? 'var(--accent-ink)'
                            : 'var(--ink-primary)',
                        }}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Interactive 4-Cell Custom Truth Table */}
            {spec.op === 'CUSTOM' && (
              <div
                className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--accent)',
                }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                  Truth Table (click bit to flip 0 ↔ 1):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      [0, 0, 0],
                      [1, 0, 1],
                      [2, 1, 0],
                      [3, 1, 1],
                    ] as const
                  ).map(([idx, a, b]) => {
                    const bit = spec.customTable[idx];
                    return (
                      <button
                        key={`${a}-${b}`}
                        type="button"
                        aria-pressed={bit === 1}
                        aria-label={`f(${a}, ${b}) equals ${bit}. Click to toggle`}
                        onClick={() => {
                          const nextTable = [...spec.customTable] as [
                            0 | 1,
                            0 | 1,
                            0 | 1,
                            0 | 1,
                          ];
                          nextTable[idx] = bit === 1 ? 0 : 1;
                          onChangeSpec({ ...spec, customTable: nextTable });
                        }}
                        className="pressable flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold tabular-nums"
                        style={{
                          backgroundColor:
                            bit === 1 ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor:
                            bit === 1 ? 'var(--accent)' : 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <span style={{ color: 'var(--ink-muted)' }}>
                          ({a},{b}) →
                        </span>
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-md font-bold"
                          style={{
                            backgroundColor:
                              bit === 1 ? 'var(--accent)' : 'var(--bg-elevated)',
                            color:
                              bit === 1
                                ? 'var(--accent-ink)'
                                : 'var(--ink-secondary)',
                          }}
                        >
                          {bit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. COMPARISON */}
        {spec.kind === 'comparison' && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Domain segmented toggle */}
            <div
              className="flex items-center rounded-xl border p-0.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
              role="group"
              aria-label="Comparison number domain"
            >
              {(
                [
                  { id: 'unary', label: 'Unary (I / #)' },
                  { id: 'binary', label: 'Binary (0 / 1)' },
                ] as const
              ).map((dom) => {
                const active = spec.domain === dom.id;
                return (
                  <button
                    key={dom.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onChangeSpec(
                        { ...spec, domain: dom.id },
                        getComparisonSample(dom.id, spec.op),
                      )
                    }
                    className="pressable min-h-8 rounded-lg px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: active
                        ? 'var(--bg-surface)'
                        : 'transparent',
                      color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
                      boxShadow: active
                        ? '0 1px 2px rgba(0, 0, 0, 0.08)'
                        : undefined,
                    }}
                  >
                    {dom.label}
                  </button>
                );
              })}
            </div>

            {/* Relation selector */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Comparison relation"
            >
              {COMPARISON_OPS.map((rel) => {
                const active = spec.op === rel.id;
                return (
                  <button
                    key={rel.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onChangeSpec(
                        { ...spec, op: rel.id },
                        getComparisonSample(spec.domain, rel.id),
                      )
                    }
                    className="pressable min-h-8 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: active
                        ? 'var(--accent)'
                        : 'var(--bg-elevated)',
                      borderColor: active
                        ? 'var(--accent)'
                        : 'var(--border-subtle)',
                      color: active
                        ? 'var(--accent-ink)'
                        : 'var(--ink-secondary)',
                    }}
                  >
                    {rel.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. DIRECT TM / L&P */}
        {spec.kind === 'direct-tm' && (
          <div className="flex flex-col gap-2.5">
            {/* Mode selector */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Direct Turing Machine mode"
              >
                {DIRECT_MODES.map((m) => {
                  const active = spec.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (m.id === spec.mode) return;
                        if (m.id === 'pipeline') {
                          onChangeSpec(
                            {
                              ...spec,
                              mode: 'pipeline',
                              pipeline:
                                spec.pipeline.length > 0
                                  ? spec.pipeline
                                  : [
                                      { id: createStepId(), op: 'C' },
                                      { id: createStepId(), op: 'S_L' },
                                    ],
                              symbols: spec.symbols || 'I',
                            },
                            '#III#',
                          );
                        } else if (m.id === 'anbncn') {
                          onChangeSpec(
                            { ...spec, mode: 'anbncn', symbols: 'a,b,c' },
                            '#aabbcc#',
                          );
                        } else if (m.id === 'reverse') {
                          onChangeSpec(
                            { ...spec, mode: 'reverse', symbols: '0,1' },
                            '#1011#',
                          );
                        } else if (m.id === 'copy-eq') {
                          onChangeSpec(
                            { ...spec, mode: 'copy-eq', symbols: '0,1' },
                            '#101#101#',
                          );
                        } else {
                          onChangeSpec({ ...spec, mode: 'custom' });
                        }
                      }}
                      className="pressable min-h-8 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: active
                          ? 'var(--accent)'
                          : 'var(--bg-elevated)',
                        borderColor: active
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                        color: active
                          ? 'var(--accent-ink)'
                          : 'var(--ink-secondary)',
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {spec.mode === 'pipeline' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    Alphabet:
                  </span>
                  {(['I', '0,1', 'a,b'] as const).map((alpha) => {
                    const active = spec.symbols === alpha;
                    return (
                      <button
                        key={alpha}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onChangeSpec(
                            { ...spec, symbols: alpha },
                            alpha === 'I'
                              ? '#III#'
                              : alpha === '0,1'
                                ? '#101#'
                                : '#aba#',
                          )
                        }
                        className="pressable min-h-7 rounded-lg border px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: active
                            ? 'var(--accent-soft)'
                            : 'var(--bg-elevated)',
                          borderColor: active
                            ? 'var(--accent)'
                            : 'var(--border-subtle)',
                          color: active
                            ? 'var(--accent)'
                            : 'var(--ink-secondary)',
                        }}
                      >
                        {alpha}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mode: Pipeline */}
            {spec.mode === 'pipeline' && (
              <div className="flex flex-col gap-2">
                {/* Active Horizontal Pill Pipeline */}
                <div
                  className="flex flex-wrap items-center gap-1.5 rounded-xl border px-3 py-2"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="inline-flex h-7 items-center rounded-lg px-2 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    &gt;
                  </span>

                  {spec.pipeline.length === 0 ? (
                    <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                      Add L&amp;P building blocks below to compose your machine pipeline
                    </span>
                  ) : (
                    spec.pipeline.map((step, index) => (
                      <div key={step.id} className="flex items-center gap-1.5">
                        {index > 0 && (
                          <ArrowRight
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: 'var(--ink-muted)' }}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className="inline-flex items-center gap-1 rounded-lg border py-1 pl-2.5 pr-1.5 text-xs font-semibold shadow-sm"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          <span>{formatPipelineStep(step)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              onChangeSpec({
                                ...spec,
                                pipeline: spec.pipeline.filter(
                                  (s) => s.id !== step.id,
                                ),
                              })
                            }
                            aria-label={`Remove step ${index + 1}: ${formatPipelineStep(step)}`}
                            className="pressable flex h-5 w-5 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* + Add Block Palette */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    + Add Block:
                  </span>
                  {PIPELINE_PALETTE.map((block) => (
                    <button
                      key={block.label}
                      type="button"
                      onClick={() =>
                        onChangeSpec({
                          ...spec,
                          pipeline: [
                            ...spec.pipeline,
                            {
                              id: createStepId(),
                              op: block.op,
                              symbol: block.symbol,
                            },
                          ],
                        })
                      }
                      className="pressable inline-flex min-h-7 items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      <Plus className="h-3 w-3" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                      <span>{block.label}</span>
                    </button>
                  ))}
                </div>

                {/* Quick Preset Chains */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    Preset Chains:
                  </span>
                  {PIPELINE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onChangeSpec(
                          {
                            ...spec,
                            mode: 'pipeline',
                            symbols: preset.symbols,
                            pipeline: preset.steps.map((s) => ({
                              id: createStepId(),
                              op: s.op,
                              symbol: s.symbol,
                            })),
                          },
                          preset.sample,
                        )
                      }
                      className="pressable min-h-7 rounded-lg border px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mode: anbncn / reverse / copy-eq */}
            {(spec.mode === 'anbncn' ||
              spec.mode === 'reverse' ||
              spec.mode === 'copy-eq') && (
              <div
                className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <label
                    htmlFor={symbolsInputId}
                    className="text-xs font-semibold whitespace-nowrap"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Symbols:
                  </label>
                  <input
                    id={symbolsInputId}
                    type="text"
                    value={spec.symbols}
                    onChange={(e) =>
                      onChangeSpec({ ...spec, symbols: e.target.value })
                    }
                    placeholder={spec.mode === 'anbncn' ? 'a,b,c' : '0,1'}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-9 w-40 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  {spec.mode === 'anbncn'
                    ? 'Decides context-sensitive triples xⁿyⁿzⁿ (n ≥ 1) using 3 comma-separated symbols.'
                    : spec.mode === 'reverse'
                      ? 'Transduces #w# → #wᴿ# over the specified comma-separated tape symbols.'
                      : 'Decides w₁#w₂ equality (#Ⓨ# when w₁ = w₂) over the specified symbols.'}
                </p>
              </div>
            )}

            {/* Mode: custom */}
            {spec.mode === 'custom' && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                  Author custom states, transition rules, or text DSL definitions directly and run them live on the tape.
                </p>
                <button
                  type="button"
                  onClick={onOpenEditor}
                  className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Rule &amp; DSL Editor</span>
                </button>
              </div>
            )}
          </div>
        )}

        {compileError && (
          <div
            id={compileErrorId}
            role="alert"
            className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{
              backgroundColor: 'var(--reject-soft)',
              borderColor: 'var(--reject)',
              color: 'var(--reject)',
              overflowWrap: 'anywhere',
            }}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{compileError}</span>
          </div>
        )}
      </div>

      {/* Bottom Micro-Status Strip */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>
            {activeMachine.name}
          </span>
          <span
            className="rounded-lg border px-2 py-0.5 text-[11px] font-medium tabular-nums"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-secondary)',
            }}
          >
            {activeMachine.states.length} states · {activeMachine.transitions.length} transitions
          </span>
          <span
            className="rounded-lg px-2 py-0.5 text-[11px] font-semibold"
            style={kindStyle}
          >
            {kindLabel}
          </span>
          {compileNotes && spec.kind !== 'context-free' && !compileError && (
            <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              {compileNotes}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenBuiltIns && (
            <button
              type="button"
              onClick={onOpenBuiltIns}
              className="pressable inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--ink-secondary)',
              }}
            >
              <Blocks className="h-3 w-3" style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span>L&amp;P Built-ins</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenEditor}
            className="pressable inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-secondary)',
            }}
          >
            <PencilLine className="h-3 w-3" aria-hidden="true" />
            <span>Inspect / Edit δ</span>
          </button>
        </div>
      </div>
    </section>
  );
}
