import { describe, expect, it } from 'vitest';
import { parseFromDSL } from '../../engine/dsl';
import { deriveLpSchemaFromTm } from '../../engine/schemaFromTm';
import { runSimulation } from '../../engine/simulator';
import type { TuringMachineDefinition } from '../../engine/types';
import { BUILTIN_BY_ID, BUILTIN_TEMPLATES } from '../../templates';
import {
  compileBinaryLogicToTm,
  compileCfgToTm,
  compileComparisonToTm,
  compileDirectTm,
  compileLanguageSpec,
  compileRegexToTm,
  compileUnaryArithmeticToTm,
  DEFAULT_SPECS,
} from '../index';
import type { BinaryLogicOp, ComparisonOp, ComposerCategory } from '../types';

function assertMachineWellFormed(machine: TuringMachineDefinition) {
  expect(machine.blankSymbol).toBe('#');
  expect(machine.states.length).toBeGreaterThanOrEqual(2);
  const stateIds = new Set(machine.states.map((s) => s.id));
  expect(stateIds.has(machine.startState)).toBe(true);
  expect(machine.haltStates.length).toBeGreaterThanOrEqual(1);
  for (const h of machine.haltStates) {
    expect(stateIds.has(h)).toBe(true);
  }

  // Strictly deterministic transition table: no duplicate (from, read) keys
  const seen = new Set<string>();
  for (const t of machine.transitions) {
    expect(stateIds.has(t.from)).toBe(true);
    expect(stateIds.has(t.to)).toBe(true);
    const key = `${t.from}\0${t.read}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }

  // Layout coordinates must be finite and distinct
  const coords = new Set<string>();
  for (const s of machine.states) {
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
    coords.add(`${s.x},${s.y}`);
  }
  expect(coords.size).toBe(machine.states.length);

  // Lewis & Papadimitriou schemaDiagram & schemaNodeId integrity
  expect(machine.schemaDiagram).toBeDefined();
  const schema = machine.schemaDiagram!;
  expect(schema.nodes.length).toBeGreaterThanOrEqual(2);
  const schemaNodeIds = new Set(schema.nodes.map((n) => n.id));
  expect(schemaNodeIds.size).toBe(schema.nodes.length);
  for (const n of schema.nodes) {
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
  }
  for (const edge of schema.edges) {
    expect(schemaNodeIds.has(edge.from)).toBe(true);
    expect(schemaNodeIds.has(edge.to)).toBe(true);
  }
  for (const s of machine.states) {
    expect(s.schemaNodeId).toBeDefined();
    if (s.schemaNodeId !== undefined) {
      expect(schemaNodeIds.has(s.schemaNodeId)).toBe(true);
    }
  }
}

function assertRunsCanonical(
  machine: TuringMachineDefinition,
  input: string,
  expectedOutput: string,
  verdict?: 'accept' | 'reject',
  maxSteps = 8000,
) {
  const trace = runSimulation(machine, input, maxSteps);
  expect(trace.status).not.toBe('step-limit');
  expect(trace.output).toBe(expectedOutput);
  expect(trace.headAtCanonicalEnd).toBe(true);
  if (machine.kind === 'decider') {
    if (verdict === 'accept' || expectedOutput === '#Ⓨ#') {
      expect(trace.status).toBe('accepted');
    } else if (verdict === 'reject' || expectedOutput === '#Ⓝ#') {
      expect(trace.status).toBe('rejected');
    }
  }
  return trace;
}

describe('Language-to-TM Compiler Suite', () => {
  describe('DEFAULT_SPECS & compileLanguageSpec', () => {
    it('compiles all 6 default specs cleanly and passes all sampleInputs', () => {
      const categories: ComposerCategory[] = [
        'regular',
        'context-free',
        'unary-arithmetic',
        'binary-logic',
        'comparison',
        'direct-tm',
      ];
      for (const cat of categories) {
        const res = compileLanguageSpec(DEFAULT_SPECS[cat]);
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        assertMachineWellFormed(res.machine);
        expect(res.machine.sampleInputs.length).toBeGreaterThan(0);
        for (const s of res.machine.sampleInputs) {
          assertRunsCanonical(res.machine, s.input, s.expectedOutput, s.verdict);
        }
      }
    });
  });

  describe('1. Regex-to-TM Compiler (regexToTm)', () => {
    it('compiles (a|b)*abb and verifies accepted & rejected words', () => {
      const res = compileRegexToTm({ kind: 'regular', pattern: '(a|b)*abb' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const tm = res.machine;
      assertMachineWellFormed(tm);
      expect(tm.kind).toBe('decider');
      expect(tm.inputAlphabet).toEqual(['a', 'b']);

      assertRunsCanonical(tm, '#abb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#aabb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#bababb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#', '#Ⓝ#', 'reject');
      assertRunsCanonical(tm, '#ab#', '#Ⓝ#', 'reject');
      assertRunsCanonical(tm, '#abba#', '#Ⓝ#', 'reject');

      expect(tm.sampleInputs.some((s) => s.verdict === 'accept')).toBe(true);
      expect(tm.sampleInputs.some((s) => s.verdict === 'reject')).toBe(true);
      for (const s of tm.sampleInputs) {
        assertRunsCanonical(tm, s.input, s.expectedOutput, s.verdict);
      }
    });

    it('supports +, ?, implicit concat, spaces, and ε / eps', () => {
      const res = compileRegexToTm({ kind: 'regular', pattern: 'a+ (b | eps) c?' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const tm = res.machine;
      assertMachineWellFormed(tm);

      assertRunsCanonical(tm, '#a#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#aaab#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#abc#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#ac#', '#Ⓨ#', 'accept');
      assertRunsCanonical(tm, '#', '#Ⓝ#', 'reject');
      assertRunsCanonical(tm, '#bc#', '#Ⓝ#', 'reject');
      assertRunsCanonical(tm, '#abcc#', '#Ⓝ#', 'reject');

      // Word containing 'eps' substring ('steps') should tokenize as literals s,t,e,p,s
      const wordRes = compileRegexToTm({ kind: 'regular', pattern: 'steps' });
      expect(wordRes.ok).toBe(true);
      if (wordRes.ok) {
        assertMachineWellFormed(wordRes.machine);
        assertRunsCanonical(wordRes.machine, '#steps#', '#Ⓨ#', 'accept');
        assertRunsCanonical(wordRes.machine, '#sts#', '#Ⓝ#', 'reject');
      }
    });

    it('handles empty-string regex ε cleanly (empty Σ)', () => {
      const res = compileRegexToTm({ kind: 'regular', pattern: 'ε' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      expect(res.machine.inputAlphabet).toEqual([]);
      assertRunsCanonical(res.machine, '#', '#Ⓨ#', 'accept');
    });

    it('handles dead/sink state minimization for exact fixed string ab', () => {
      const res = compileRegexToTm({ kind: 'regular', pattern: 'ab' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#ab#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#a#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#aba#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#ba#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#', '#Ⓝ#', 'reject');
    });

    it('returns clear errors for invalid regex syntax or # blank symbol', () => {
      expect(compileRegexToTm({ kind: 'regular', pattern: '' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: 'a#b' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: '(a|b' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: 'a|b)' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: '()' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: '*a' }).ok).toBe(false);
      expect(compileRegexToTm({ kind: 'regular', pattern: 'a|' }).ok).toBe(false);
    });
  });

  describe('2. CFG-to-TM Compiler (cfgToTm)', () => {
    it('Tier 1: compiles right-linear grammars via NFA -> DFA -> TM', () => {
      const res = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S -> a S | b A
          A -> b A | ε
        `,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      expect(res.notes).toContain('Tier 1');

      assertRunsCanonical(res.machine, '#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#aabbb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#b#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#ba#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#aba#', '#Ⓝ#', 'reject');
    });

    it('Tier 2a: compiles matched powers a^n b^n, a^n b^{2n}, and 0^n c 1^n', () => {
      const res1 = compileCfgToTm({ kind: 'context-free', grammar: 'S -> a S b | a b' });
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        assertMachineWellFormed(res1.machine);
        assertRunsCanonical(res1.machine, '#ab#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res1.machine, '#aaabbb#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res1.machine, '#', '#Ⓝ#', 'reject');
        assertRunsCanonical(res1.machine, '#aab#', '#Ⓝ#', 'reject');
        assertRunsCanonical(res1.machine, '#abab#', '#Ⓝ#', 'reject');
      }

      const res2 = compileCfgToTm({ kind: 'context-free', grammar: 'S -> a S b b | a b b' });
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        assertMachineWellFormed(res2.machine);
        assertRunsCanonical(res2.machine, '#abb#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res2.machine, '#aabbbb#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res2.machine, '#ab#', '#Ⓝ#', 'reject');
        assertRunsCanonical(res2.machine, '#aabbb#', '#Ⓝ#', 'reject');
      }

      const res3 = compileCfgToTm({ kind: 'context-free', grammar: 'S -> 0 S 1 | c' });
      expect(res3.ok).toBe(true);
      if (res3.ok) {
        assertMachineWellFormed(res3.machine);
        assertRunsCanonical(res3.machine, '#c#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res3.machine, '#00c11#', '#Ⓨ#', 'accept');
        assertRunsCanonical(res3.machine, '#', '#Ⓝ#', 'reject');
        assertRunsCanonical(res3.machine, '#01#', '#Ⓝ#', 'reject');
        assertRunsCanonical(res3.machine, '#0cc1#', '#Ⓝ#', 'reject');
      }
    });

    it('Tier 2b: compiles palindromes (both full and even-only / odd-only)', () => {
      const full = compileCfgToTm({
        kind: 'context-free',
        grammar: 'S -> a S a | b S b | a | b | ε',
      });
      expect(full.ok).toBe(true);
      if (full.ok) {
        assertMachineWellFormed(full.machine);
        assertRunsCanonical(full.machine, '#', '#Ⓨ#', 'accept');
        assertRunsCanonical(full.machine, '#a#', '#Ⓨ#', 'accept');
        assertRunsCanonical(full.machine, '#abba#', '#Ⓨ#', 'accept');
        assertRunsCanonical(full.machine, '#aba#', '#Ⓨ#', 'accept');
        assertRunsCanonical(full.machine, '#abab#', '#Ⓝ#', 'reject');
      }

      const evenOnly = compileCfgToTm({
        kind: 'context-free',
        grammar: 'S -> a S a | b S b | ε',
      });
      expect(evenOnly.ok).toBe(true);
      if (evenOnly.ok) {
        assertMachineWellFormed(evenOnly.machine);
        assertRunsCanonical(evenOnly.machine, '#abba#', '#Ⓨ#', 'accept');
        assertRunsCanonical(evenOnly.machine, '#aba#', '#Ⓝ#', 'reject');
      }
    });

    it('Tier 2c: compiles balanced parentheses / Dyck grammars', () => {
      const dyck1 = compileCfgToTm({
        kind: 'context-free',
        grammar: 'S -> ( S ) S | ε',
      });
      expect(dyck1.ok).toBe(true);
      if (dyck1.ok) {
        assertMachineWellFormed(dyck1.machine);
        assertRunsCanonical(dyck1.machine, '#', '#Ⓨ#', 'accept');
        assertRunsCanonical(dyck1.machine, '#(()())#', '#Ⓨ#', 'accept');
        assertRunsCanonical(dyck1.machine, '#)(#', '#Ⓝ#', 'reject');
        assertRunsCanonical(dyck1.machine, '#(()#', '#Ⓝ#', 'reject');
      }

      const dyck2 = compileCfgToTm({
        kind: 'context-free',
        grammar: 'S -> ( S ) | [ S ] | S S | ε',
      });
      expect(dyck2.ok).toBe(true);
      if (dyck2.ok) {
        assertMachineWellFormed(dyck2.machine);
        assertRunsCanonical(dyck2.machine, '#([()])[]#', '#Ⓨ#', 'accept');
        assertRunsCanonical(dyck2.machine, '#([)]#', '#Ⓝ#', 'reject');
      }
    });

    it('Tier 2d: compiles equal counts #_a(w) = #_b(w)', () => {
      const res = compileCfgToTm({
        kind: 'context-free',
        grammar: 'S -> a S b S | b S a S | ε',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#abab#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#bbaa#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#aab#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#b#', '#Ⓝ#', 'reject');
    });

    it('Tier 3: compiles arbitrary non-pattern CFGs via bottom-up tape reduction + CYK samples', () => {
      // Nested deterministic CFL not matching Tier 2 patterns: { a c^n d^n b | n >= 1 } U { a b }
      const res = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S -> a A b | a b
          A -> c A d | c d
        `,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      expect(res.warning).toBeUndefined();
      assertRunsCanonical(res.machine, '#ab#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#acdb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#accddb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#acddb#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#a#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#', '#Ⓝ#', 'reject');

      // Multi-symbol shift reduction: S -> a A b | ε, A -> c d
      const resShift = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S → a A b | eps
          A → c d
        `,
      });
      expect(resShift.ok).toBe(true);
      if (!resShift.ok) return;
      assertMachineWellFormed(resShift.machine);
      assertRunsCanonical(resShift.machine, '#', '#Ⓨ#', 'accept');
      assertRunsCanonical(resShift.machine, '#acdb#', '#Ⓨ#', 'accept');
      assertRunsCanonical(resShift.machine, '#acd#', '#Ⓝ#', 'reject');
      assertRunsCanonical(resShift.machine, '#ab#', '#Ⓝ#', 'reject');

      // Continuation '|' syntax, semicolons, and ε-only grammar
      const resCont = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S -> a a S b
          | a a b;
        `,
      });
      expect(resCont.ok).toBe(true);
      if (resCont.ok) {
        assertMachineWellFormed(resCont.machine);
        assertRunsCanonical(resCont.machine, '#aab#', '#Ⓨ#', 'accept');
        assertRunsCanonical(resCont.machine, '#aaaabb#', '#Ⓨ#', 'accept');
        assertRunsCanonical(resCont.machine, '#ab#', '#Ⓝ#', 'reject');
      }
      // Tier 3 with no generating non-empty derivations (rules.length === 0 after pruning)
      const resZeroRules = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S -> A | ε
          A -> A a
        `,
      });
      expect(resZeroRules.ok).toBe(true);
      if (resZeroRules.ok) {
        assertMachineWellFormed(resZeroRules.machine);
        assertRunsCanonical(resZeroRules.machine, '#', '#Ⓨ#', 'accept');
        assertRunsCanonical(resZeroRules.machine, '#a#', '#Ⓝ#', 'reject');
      }
    });

    it('Tier 3 emits polite warning only when greedy reduction diverges from CYK', () => {
      // Right-recursive nonterminal chain A -> a A | a cannot be reduced left-to-right greedily on 'aaab'
      const res = compileCfgToTm({
        kind: 'context-free',
        grammar: `
          S -> A b
          A -> a A | a
        `,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      expect(res.warning).toBeDefined();
    });

    it('rejects malformed CFGs cleanly', () => {
      expect(compileCfgToTm({ kind: 'context-free', grammar: '' }).ok).toBe(false);
      expect(compileCfgToTm({ kind: 'context-free', grammar: 'a -> b' }).ok).toBe(false);
      expect(compileCfgToTm({ kind: 'context-free', grammar: 'S -> a # b' }).ok).toBe(false);
      expect(compileCfgToTm({ kind: 'context-free', grammar: 'S a b' }).ok).toBe(false);
    });
  });

  describe('3. Unary Arithmetic Compiler (arithmeticToTm)', () => {
    it('compiles monus, add, multiply', () => {
      const monus = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'monus', constantK: 1 });
      expect(monus.ok).toBe(true);
      if (monus.ok) {
        assertMachineWellFormed(monus.machine);
        assertRunsCanonical(monus.machine, '#III#II#', '#I#');
        assertRunsCanonical(monus.machine, '#II#III#', '#');
        assertRunsCanonical(monus.machine, '###', '#');
      }

      const add = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'add', constantK: 1 });
      expect(add.ok).toBe(true);
      if (add.ok) {
        assertMachineWellFormed(add.machine);
        expect(add.machine.schemaDiagram).toBeDefined();
        assertRunsCanonical(add.machine, '#III#II#', '#IIIII#');
        assertRunsCanonical(add.machine, '###', '#');
      }

      const mul = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'multiply', constantK: 1 });
      expect(mul.ok).toBe(true);
      if (mul.ok) {
        assertMachineWellFormed(mul.machine);
        assertRunsCanonical(mul.machine, '#III#II#', '#IIIIII#');
        assertRunsCanonical(mul.machine, '#III##', '#');
        assertRunsCanonical(mul.machine, '##II#', '#');
      }
    });

    it('compiles integer division ⌊m ÷ n⌋ with all edge cases', () => {
      const res = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'divide', constantK: 1 });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#III#II#', '#I#');
      assertRunsCanonical(res.machine, '#IIIIII#II#', '#III#');
      assertRunsCanonical(res.machine, '#II#III#', '#');
      assertRunsCanonical(res.machine, '#I#I#', '#I#');
      assertRunsCanonical(res.machine, '#III##', '#');
      assertRunsCanonical(res.machine, '##II#', '#');
      assertRunsCanonical(res.machine, '###', '#');
    });

    it('compiles modulo (m mod n) with all edge cases', () => {
      const res = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'modulo', constantK: 1 });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#IIIII#II#', '#I#');
      assertRunsCanonical(res.machine, '#IIII#II#', '#');
      assertRunsCanonical(res.machine, '#II#III#', '#II#');
      assertRunsCanonical(res.machine, '#I#I#', '#');
      assertRunsCanonical(res.machine, '#III##', '#');
      assertRunsCanonical(res.machine, '##II#', '#');
      assertRunsCanonical(res.machine, '###', '#');
    });

    it('compiles scale (k*n), add-const (n+k), and sub-const (max(0, n-k)) for k=1..5', () => {
      for (const k of [1, 2, 3, 4, 5]) {
        const scale = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'scale', constantK: k });
        expect(scale.ok).toBe(true);
        if (scale.ok) {
          assertMachineWellFormed(scale.machine);
          expect(scale.machine.schemaDiagram).toBeDefined();
          assertRunsCanonical(scale.machine, '#II#', `#${'I'.repeat(2 * k)}#`);
          assertRunsCanonical(scale.machine, '#', '#');
        }

        const addC = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'add-const', constantK: k });
        expect(addC.ok).toBe(true);
        if (addC.ok) {
          assertMachineWellFormed(addC.machine);
          expect(addC.machine.schemaDiagram).toBeDefined();
          assertRunsCanonical(addC.machine, '#II#', `#${'I'.repeat(2 + k)}#`);
          assertRunsCanonical(addC.machine, '#', `#${'I'.repeat(k)}#`);
        }

        const subC = compileUnaryArithmeticToTm({ kind: 'unary-arithmetic', op: 'sub-const', constantK: k });
        expect(subC.ok).toBe(true);
        if (subC.ok) {
          assertMachineWellFormed(subC.machine);
          assertRunsCanonical(subC.machine, `#${'I'.repeat(k + 2)}#`, '#II#');
          assertRunsCanonical(subC.machine, `#${'I'.repeat(k)}#`, '#');
          assertRunsCanonical(subC.machine, '#', '#');
        }
      }
    });
  });

  describe('4. Binary Logic Compiler (logicToTm)', () => {
    it('compiles all 8 two-input bitwise gates with equal and unequal widths', () => {
      const cases: Array<{
        op: BinaryLogicOp;
        custom?: [0 | 1, 0 | 1, 0 | 1, 0 | 1];
        tests: Array<[string, string]>;
      }> = [
        { op: 'AND', tests: [['#101#110#', '#100#'], ['#101#1#', '#001#'], ['#1#101#', '#001#'], ['###', '#']] },
        { op: 'OR', tests: [['#101#110#', '#111#'], ['#101#1#', '#101#'], ['#1#100#', '#101#'], ['###', '#']] },
        { op: 'XOR', tests: [['#101#110#', '#011#'], ['#101#1#', '#100#'], ['#1#10#', '#11#'], ['###', '#']] },
        { op: 'NAND', tests: [['#101#110#', '#011#'], ['#101#1#', '#110#'], ['#1#101#', '#110#'], ['###', '#']] },
        { op: 'NOR', tests: [['#101#110#', '#000#'], ['#101#1#', '#010#'], ['#0#100#', '#011#'], ['###', '#']] },
        { op: 'XNOR', tests: [['#101#110#', '#100#'], ['#101#1#', '#011#'], ['#1#101#', '#011#'], ['###', '#']] },
        { op: 'IMPLIES', tests: [['#1010#1100#', '#1101#'], ['#101#1#', '#011#'], ['#1#101#', '#111#'], ['###', '#']] },
        { op: 'CUSTOM', custom: [0, 1, 0, 1], tests: [['#101#110#', '#110#'], ['#101#0#', '#000#'], ['#1#101#', '#101#']] },
      ];

      for (const tc of cases) {
        const res = compileBinaryLogicToTm({
          kind: 'binary-logic',
          op: tc.op,
          customTable: tc.custom ?? [0, 1, 1, 0],
        });
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        assertMachineWellFormed(res.machine);
        for (const [inp, exp] of tc.tests) {
          assertRunsCanonical(res.machine, inp, exp);
        }
      }
    });

    it('compiles all 5 unary-input binary logic operations (NOT, INC, TWOS_COMP, EVEN_PARITY, ODD_PARITY)', () => {
      const notRes = compileBinaryLogicToTm({ kind: 'binary-logic', op: 'NOT', customTable: [0, 0, 0, 0] });
      expect(notRes.ok).toBe(true);
      if (notRes.ok) {
        assertMachineWellFormed(notRes.machine);
        assertRunsCanonical(notRes.machine, '#10110#', '#01001#');
        assertRunsCanonical(notRes.machine, '#', '#');
      }

      const incRes = compileBinaryLogicToTm({ kind: 'binary-logic', op: 'INC', customTable: [0, 0, 0, 0] });
      expect(incRes.ok).toBe(true);
      if (incRes.ok) {
        assertMachineWellFormed(incRes.machine);
        assertRunsCanonical(incRes.machine, '#1011#', '#1100#');
        assertRunsCanonical(incRes.machine, '#111#', '#1000#');
        assertRunsCanonical(incRes.machine, '#', '#1#');
      }

      const twosRes = compileBinaryLogicToTm({ kind: 'binary-logic', op: 'TWOS_COMP', customTable: [0, 0, 0, 0] });
      expect(twosRes.ok).toBe(true);
      if (twosRes.ok) {
        assertMachineWellFormed(twosRes.machine);
        assertRunsCanonical(twosRes.machine, '#0100#', '#1100#');
        assertRunsCanonical(twosRes.machine, '#1010#', '#0110#');
        assertRunsCanonical(twosRes.machine, '#0000#', '#0000#');
        assertRunsCanonical(twosRes.machine, '#0001#', '#1111#');
        assertRunsCanonical(twosRes.machine, '#', '#');
      }

      const evenRes = compileBinaryLogicToTm({ kind: 'binary-logic', op: 'EVEN_PARITY', customTable: [0, 0, 0, 0] });
      expect(evenRes.ok).toBe(true);
      if (evenRes.ok) {
        assertMachineWellFormed(evenRes.machine);
        assertRunsCanonical(evenRes.machine, '#', '#Ⓨ#', 'accept');
        assertRunsCanonical(evenRes.machine, '#1010#', '#Ⓨ#', 'accept');
        assertRunsCanonical(evenRes.machine, '#1011#', '#Ⓝ#', 'reject');
      }

      const oddRes = compileBinaryLogicToTm({ kind: 'binary-logic', op: 'ODD_PARITY', customTable: [0, 0, 0, 0] });
      expect(oddRes.ok).toBe(true);
      if (oddRes.ok) {
        assertMachineWellFormed(oddRes.machine);
        assertRunsCanonical(oddRes.machine, '#', '#Ⓝ#', 'reject');
        assertRunsCanonical(oddRes.machine, '#1010#', '#Ⓝ#', 'reject');
        assertRunsCanonical(oddRes.machine, '#1011#', '#Ⓨ#', 'accept');
      }
    });
  });

  describe('5. Comparison Compiler (comparisonToTm)', () => {
    it('compiles all 7 unary comparisons over #I^m#I^n#', () => {
      const ops: ComparisonOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'three-way'];
      const expected: Record<ComparisonOp, [string, string, string]> = {
        eq: ['#Ⓝ#', '#Ⓨ#', '#Ⓝ#'],
        neq: ['#Ⓨ#', '#Ⓝ#', '#Ⓨ#'],
        gt: ['#Ⓝ#', '#Ⓝ#', '#Ⓨ#'],
        gte: ['#Ⓝ#', '#Ⓨ#', '#Ⓨ#'],
        lt: ['#Ⓨ#', '#Ⓝ#', '#Ⓝ#'],
        lte: ['#Ⓨ#', '#Ⓨ#', '#Ⓝ#'],
        'three-way': ['#<#', '#=#', '#>#'],
      };

      for (const op of ops) {
        const res = compileComparisonToTm({ kind: 'comparison', domain: 'unary', op });
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        assertMachineWellFormed(res.machine);
        const [ltOut, eqOut, gtOut] = expected[op];
        assertRunsCanonical(res.machine, '#II#III#', ltOut);
        assertRunsCanonical(res.machine, '#II#II#', eqOut);
        assertRunsCanonical(res.machine, '#III#II#', gtOut);
        assertRunsCanonical(res.machine, '###', eqOut);
      }
    });

    it('compiles all 7 binary unsigned magnitude comparisons including unequal widths & leading 0s', () => {
      const ops: ComparisonOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'three-way'];
      const expected: Record<ComparisonOp, [string, string, string]> = {
        eq: ['#Ⓝ#', '#Ⓨ#', '#Ⓝ#'],
        neq: ['#Ⓨ#', '#Ⓝ#', '#Ⓨ#'],
        gt: ['#Ⓝ#', '#Ⓝ#', '#Ⓨ#'],
        gte: ['#Ⓝ#', '#Ⓨ#', '#Ⓨ#'],
        lt: ['#Ⓨ#', '#Ⓝ#', '#Ⓝ#'],
        lte: ['#Ⓨ#', '#Ⓨ#', '#Ⓝ#'],
        'three-way': ['#<#', '#=#', '#>#'],
      };

      for (const op of ops) {
        const res = compileComparisonToTm({ kind: 'comparison', domain: 'binary', op });
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        assertMachineWellFormed(res.machine);
        const [ltOut, eqOut, gtOut] = expected[op];
        // Equal-length comparisons
        assertRunsCanonical(res.machine, '#101#110#', ltOut);
        assertRunsCanonical(res.machine, '#101#101#', eqOut);
        assertRunsCanonical(res.machine, '#101#100#', gtOut);
        // Unequal lengths & leading zeros
        assertRunsCanonical(res.machine, '#0101#101#', eqOut);
        assertRunsCanonical(res.machine, '#00101#101#', eqOut);
        assertRunsCanonical(res.machine, '#1000#111#', gtOut);
        assertRunsCanonical(res.machine, '#1010#111#', gtOut);
        assertRunsCanonical(res.machine, '#111#1000#', ltOut);
        // Zero / empty combinations & multi-digit leading-zero cases
        assertRunsCanonical(res.machine, '###', eqOut);
        assertRunsCanonical(res.machine, '#000#0#', eqOut);
        assertRunsCanonical(res.machine, '#0000#0000#', eqOut);
        assertRunsCanonical(res.machine, '#0010#00011#', ltOut);
        assertRunsCanonical(res.machine, '#10000#1111#', gtOut);
        assertRunsCanonical(res.machine, '##1#', ltOut);
        assertRunsCanonical(res.machine, '#001##', gtOut);
      }
    });
  });

  describe('6. Direct TM & Pipeline Compiler (directToTm)', () => {
    it('compiles macro pipelines with matching activeSchemaNodeId', () => {
      const res = compileDirectTm({
        kind: 'direct-tm',
        mode: 'pipeline',
        pipeline: [
          { id: '1', op: 'C' },
          { id: '2', op: 'S_L' },
        ],
        symbols: 'a,b,c',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      expect(res.machine.schemaDiagram?.nodes.map((n) => n.id)).toEqual(['p_0', 'p_1', 'p_halt']);

      const trace = assertRunsCanonical(res.machine, '#abc#', '#abcabc#');
      const seenSchemaIds = new Set(trace.steps.map((s) => s.activeSchemaNodeId).filter(Boolean));
      expect(seenSchemaIds.has('p_0')).toBe(true);
      expect(seenSchemaIds.has('p_1')).toBe(true);
      expect(seenSchemaIds.has('p_halt')).toBe(true);
    });

    it('handles standalone R_hash and write/L/R primitives in pipeline', () => {
      const rHash = compileDirectTm({
        kind: 'direct-tm',
        mode: 'pipeline',
        pipeline: [{ id: '1', op: 'R_hash' }],
        symbols: '',
      });
      expect(rHash.ok).toBe(true);
      if (rHash.ok) {
        expect(rHash.machine.initialHead).toBe('leading-blank');
        assertRunsCanonical(rHash.machine, '#abc#', '#abc#');
      }

      const wr = compileDirectTm({
        kind: 'direct-tm',
        mode: 'pipeline',
        pipeline: [
          { id: '1', op: 'write', symbol: 'x' },
          { id: '2', op: 'R' },
        ],
        symbols: '',
      });
      expect(wr.ok).toBe(true);
      if (wr.ok) {
        assertRunsCanonical(wr.machine, '#ab#', '#abx#');
      }
    });

    it('compiles parametric x^n y^n z^n over custom symbols (including 0,1,2 and marker-colliding X,Y,Z)', () => {
      const res = compileDirectTm({
        kind: 'direct-tm',
        mode: 'anbncn',
        pipeline: [],
        symbols: '0,1,2',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#001122#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#012#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#00112#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#012012#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#', '#Ⓝ#', 'reject');

      const resXYZ = compileDirectTm({
        kind: 'direct-tm',
        mode: 'anbncn',
        pipeline: [],
        symbols: 'X,Y,Z',
      });
      expect(resXYZ.ok).toBe(true);
      if (resXYZ.ok) {
        assertMachineWellFormed(resXYZ.machine);
        assertRunsCanonical(resXYZ.machine, '#XXYYZZ#', '#Ⓨ#', 'accept');
        assertRunsCanonical(resXYZ.machine, '#XXYZ#', '#Ⓝ#', 'reject');
      }
    });

    it('compiles parametric reverse w^R over custom alphabet', () => {
      const res = compileDirectTm({
        kind: 'direct-tm',
        mode: 'reverse',
        pipeline: [],
        symbols: 'a,b,c',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#abcc#', '#ccba#');
      assertRunsCanonical(res.machine, '#a#', '#a#');
      assertRunsCanonical(res.machine, '#', '#');
    });

    it('compiles parametric w#w equality decider over custom alphabet', () => {
      const res = compileDirectTm({
        kind: 'direct-tm',
        mode: 'copy-eq',
        pipeline: [],
        symbols: 'a,b',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      assertMachineWellFormed(res.machine);
      assertRunsCanonical(res.machine, '#aba#aba#', '#Ⓨ#', 'accept');
      assertRunsCanonical(res.machine, '#aba#abb#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '#ab#aba#', '#Ⓝ#', 'reject');
      assertRunsCanonical(res.machine, '###', '#Ⓨ#', 'accept');
    });

    it('supports custom mode returning customMachine or error when missing', () => {
      const err = compileDirectTm({
        kind: 'direct-tm',
        mode: 'custom',
        pipeline: [],
        symbols: '',
      });
      expect(err.ok).toBe(false);

      const ok = compileDirectTm({
        kind: 'direct-tm',
        mode: 'custom',
        pipeline: [],
        symbols: '',
        customMachine: BUILTIN_BY_ID.S_L,
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.machine.id).toBe('builtin-shift-left');
    });

    it('synchronizes L&P schemas with execution traces across pipeline, anbncn, reverse, and copy-eq', () => {
      // 1. Pipeline e_end edge must be unconditional (no spurious '#' label)
      const pipeRes = compileDirectTm({
        kind: 'direct-tm',
        mode: 'pipeline',
        pipeline: [
          { id: '1', op: 'write', symbol: 'I' },
          { id: '2', op: 'R' },
        ],
        symbols: 'I',
      });
      expect(pipeRes.ok).toBe(true);
      if (pipeRes.ok) {
        const endEdge = pipeRes.machine.schemaDiagram?.edges.find((e) => e.id === 'e_end');
        expect(endEdge?.label).toBeUndefined();
      }

      // 2. x^n y^n z^n: explicit self-loops + separate R_# reject path + empty reject halt
      const cslRes = compileDirectTm({
        kind: 'direct-tm',
        mode: 'anbncn',
        pipeline: [],
        symbols: 'a,b,c',
      });
      expect(cslRes.ok).toBe(true);
      if (cslRes.ok) {
        const selfLoops = cslRes.machine.schemaDiagram!.edges.filter((e) => e.isSelfLoop);
        expect(selfLoops.map((e) => `${e.from}:${e.label}`)).toEqual(
          expect.arrayContaining(['n_findA:X', 'n_findB:a, Y', 'n_findC:b, Z', 'n_check:Y, Z']),
        );

        const accTrace = assertRunsCanonical(cslRes.machine, '#aabbcc#', '#Ⓨ#', 'accept');
        const accNodes = new Set(accTrace.steps.map((s) => s.activeSchemaNodeId));
        expect(accNodes.has('n_rewInit')).toBe(true);
        expect(accNodes.has('n_findA')).toBe(true);
        expect(accNodes.has('n_findB')).toBe(true);
        expect(accNodes.has('n_findC')).toBe(true);
        expect(accNodes.has('n_rew')).toBe(true);
        expect(accNodes.has('n_check')).toBe(true);
        expect(accNodes.has('n_clean_acc')).toBe(true);
        expect(accNodes.has('n_accept')).toBe(true);

        const rejTrace = assertRunsCanonical(cslRes.machine, '#aabbc#', '#Ⓝ#', 'reject');
        const rejNodes = new Set(rejTrace.steps.map((s) => s.activeSchemaNodeId));
        expect(rejNodes.has('n_goEndRej')).toBe(true);
        expect(rejNodes.has('n_clean_rej')).toBe(true);
        expect(rejNodes.has('n_reject')).toBe(true);

        const empTrace = assertRunsCanonical(cslRes.machine, '#', '#Ⓝ#', 'reject');
        expect(empTrace.steps[empTrace.steps.length - 1].activeSchemaNodeId).toBe('n_reject_emp');
      }

      // 3. String Reversal: split n_cIn / n_cOut, X self-loop, and wipe loop
      const revRes = compileDirectTm({
        kind: 'direct-tm',
        mode: 'reverse',
        pipeline: [],
        symbols: '0,1',
      });
      expect(revRes.ok).toBe(true);
      if (revRes.ok) {
        const selfLoops = revRes.machine.schemaDiagram!.edges.filter((e) => e.isSelfLoop);
        expect(selfLoops.map((e) => `${e.from}:${e.label}`)).toContain('n_pick:X');
        const revTrace = assertRunsCanonical(revRes.machine, '#1011#', '#1101#');
        const revNodes = new Set(revTrace.steps.map((s) => s.activeSchemaNodeId));
        expect(revNodes.has('n_cIn')).toBe(true);
        expect(revNodes.has('n_cOut')).toBe(true);
        expect(revNodes.has('n_ret')).toBe(true);
        expect(revNodes.has('n_wipe')).toBe(true);
        expect(revNodes.has('n_end')).toBe(true);
      }

      // 4. w#w Equality: explicit X self-loops on n_pick/n_match/n_chkEnd and R_S node
      const eqRes = compileDirectTm({
        kind: 'direct-tm',
        mode: 'copy-eq',
        pipeline: [],
        symbols: '0,1',
      });
      expect(eqRes.ok).toBe(true);
      if (eqRes.ok) {
        const schema = eqRes.machine.schemaDiagram!;
        const carryNode = schema.nodes.find((n) => n.id === 'n_carry');
        expect(carryNode?.label).toBe('X R_Y');
        expect(carryNode?.label).not.toContain('R_#');
        const selfLoops = schema.edges.filter((e) => e.isSelfLoop);
        expect(selfLoops.map((e) => `${e.from}:${e.label}`)).toEqual(
          expect.arrayContaining(['n_pick:X', 'n_match:X', 'n_chkEnd:X']),
        );

        const eqAcc = assertRunsCanonical(eqRes.machine, '#101#101#', '#Ⓨ#', 'accept');
        const eqAccNodes = new Set(eqAcc.steps.map((s) => s.activeSchemaNodeId));
        expect(eqAccNodes.has('n_init1')).toBe(true);
        expect(eqAccNodes.has('n_init2')).toBe(true);
        expect(eqAccNodes.has('n_pick')).toBe(true);
        expect(eqAccNodes.has('n_carry')).toBe(true);
        expect(eqAccNodes.has('n_match')).toBe(true);
        expect(eqAccNodes.has('n_back')).toBe(true);
        expect(eqAccNodes.has('n_chkEnd')).toBe(true);
        expect(eqAccNodes.has('n_clean_acc')).toBe(true);
        expect(eqAccNodes.has('n_accept')).toBe(true);

        const empEq = assertRunsCanonical(eqRes.machine, '###', '#Ⓨ#', 'accept');
        expect(empEq.steps[empEq.steps.length - 1].activeSchemaNodeId).toBe('n_acc_emp');

        const rejLeftEmp = assertRunsCanonical(eqRes.machine, '##10#', '#Ⓝ#', 'reject');
        expect(rejLeftEmp.steps[rejLeftEmp.steps.length - 1].activeSchemaNodeId).toBe('n_rej_init');

        const rejRightEmp = assertRunsCanonical(eqRes.machine, '#10##', '#Ⓝ#', 'reject');
        expect(rejRightEmp.steps[rejRightEmp.steps.length - 1].activeSchemaNodeId).toBe('n_rej_init');

        const rejShort = assertRunsCanonical(eqRes.machine, '#101#10#', '#Ⓝ#', 'reject');
        expect(rejShort.steps[rejShort.steps.length - 1].activeSchemaNodeId).toBe('n_reject');
      }
    });
  });

  describe('7. L&P Schema Integrity, Built-ins, and deriveLpSchemaFromTm', () => {
    it('verifies all 6 built-in L&P schemas and schemaNodeId state mappings', () => {
      expect(BUILTIN_TEMPLATES).toHaveLength(6);
      for (const builtin of BUILTIN_TEMPLATES) {
        assertMachineWellFormed(builtin);
        const start = builtin.schemaDiagram!.nodes.find(
          (n) => n.kind === 'start-action' || n.label.startsWith('>'),
        );
        expect(start).toBeDefined();
        const trace = runSimulation(builtin, builtin.sampleInputs[0].input, 5000);
        expect(trace.steps.some((st) => Boolean(st.activeSchemaNodeId))).toBe(true);
      }
    });

    it('verifies step-by-step activeSchemaNodeId highlights across compiled deciders and transducers', () => {
      const rx = compileRegexToTm({ kind: 'regular', pattern: '(a|b)*abb' });
      expect(rx.ok).toBe(true);
      if (rx.ok) {
        const accTrace = runSimulation(rx.machine, '#abb#', 5000);
        expect(accTrace.steps[0].activeSchemaNodeId).toBe('n_rew');
        expect(accTrace.steps[accTrace.steps.length - 1].activeSchemaNodeId).toBe('n_accept');

        const rejTrace = runSimulation(rx.machine, '#ab#', 5000);
        expect(rejTrace.steps[rejTrace.steps.length - 1].activeSchemaNodeId).toBe('n_reject');
      }

      const parity = compileBinaryLogicToTm({
        kind: 'binary-logic',
        op: 'EVEN_PARITY',
        customTable: [0, 0, 0, 0],
      });
      expect(parity.ok).toBe(true);
      if (parity.ok) {
        const acc = runSimulation(parity.machine, '#1010#', 5000);
        expect(acc.steps[acc.steps.length - 1].activeSchemaNodeId).toBe('n_accept');
        const rej = runSimulation(parity.machine, '#1011#', 5000);
        expect(rej.steps[rej.steps.length - 1].activeSchemaNodeId).toBe('n_reject');
      }
    });

    it('derives clean circle-free L&P schema diagrams for custom user-edited machines', () => {
      const dsl = `
        start: q0
        halt: qAccept, qReject
        q0, # -> q1, #, L
        q1, 0 -> q1, 0, L
        q1, 1 -> q2, 1, L
        q1, # -> qReject, Ⓝ, R
        q2, 0 -> q2, 0, L
        q2, 1 -> q2, 1, L
        q2, # -> qAccept, Ⓨ, R
      `;
      const parsed = parseFromDSL(dsl, BUILTIN_BY_ID.L_hash);
      expect(parsed.ok).toBe(true);

      const customMachine: TuringMachineDefinition = {
        ...BUILTIN_BY_ID.L_hash,
        id: 'custom-has-one',
        name: 'Has a 1 Decider',
        kind: 'decider',
        startState: parsed.startState,
        haltStates: parsed.haltStates,
        states: parsed.states,
        transitions: parsed.transitions,
        tapeAlphabet: parsed.tapeAlphabet,
        schemaDiagram: undefined,
        isCustom: true,
      };

      const schema = deriveLpSchemaFromTm(customMachine);
      expect(schema.nodes.length).toBe(customMachine.states.length);
      const ids = new Set(schema.nodes.map((n) => n.id));
      for (const edge of schema.edges) {
        expect(ids.has(edge.from)).toBe(true);
        expect(ids.has(edge.to)).toBe(true);
      }

      // Must never expose q0/q1/q2/qAccept/qReject in node labels
      for (const node of schema.nodes) {
        expect(node.label).not.toMatch(/\bq\d+/i);
        expect(node.label).not.toMatch(/qAccept|qReject/i);
      }

      const startNode = schema.nodes.find((n) => n.id === 'q0');
      expect(startNode?.kind).toBe('start-action');
      expect(startNode?.label.startsWith('>')).toBe(true);

      const accNode = schema.nodes.find((n) => n.id === 'qAccept');
      expect(accNode?.kind).toBe('halt');
      expect(accNode?.variant).toBe('accept');
      expect(accNode?.label).toContain('Ⓨ');

      const rejNode = schema.nodes.find((n) => n.id === 'qReject');
      expect(rejNode?.kind).toBe('halt');
      expect(rejNode?.variant).toBe('reject');
      expect(rejNode?.label).toContain('Ⓝ');

      // q2 self-loops on 0 and 1 should be grouped into a single self-loop edge
      const q2SelfLoops = schema.edges.filter((e) => e.from === 'q2' && e.to === 'q2');
      expect(q2SelfLoops).toHaveLength(1);
      expect(q2SelfLoops[0].isSelfLoop).toBe(true);
      expect(q2SelfLoops[0].label).toContain('0');
      expect(q2SelfLoops[0].label).toContain('1');
    });

    it('annotates heterogeneous outgoing writes/moves on deriveLpSchemaFromTm without leaking incoming writes to non-halt states', () => {
      const dsl = `
        start: q0
        halt: qH
        q0, # -> q1, #, L
        q1, 0 -> q2, X, R
        q1, 1 -> q1, 1, L
        q1, # -> qH, Ⓨ, R
        q2, # -> qH, #, S
      `;
      const parsed = parseFromDSL(dsl, BUILTIN_BY_ID.L_hash);
      expect(parsed.ok).toBe(true);

      const machine: TuringMachineDefinition = {
        ...BUILTIN_BY_ID.L_hash,
        id: 'custom-hetero',
        name: 'Heterogeneous Custom TM',
        kind: 'decider',
        startState: parsed.startState,
        haltStates: parsed.haltStates,
        states: parsed.states,
        transitions: parsed.transitions,
        tapeAlphabet: parsed.tapeAlphabet,
        schemaDiagram: undefined,
        isCustom: true,
      };

      const schema = deriveLpSchemaFromTm(machine);
      // q2 only has `# -> qH, #, S`: it must NOT inherit `X R` from incoming edge `q1 -> q2`
      const q2Node = schema.nodes.find((n) => n.id === 'q2');
      expect(q2Node?.label).not.toContain('X');

      // q1 self-loops preserving '1' moving 'L' -> node label 'L', so `q1 -> q2` ('X', 'R') must show both write and move
      const q1ToQ2 = schema.edges.find((e) => e.from === 'q1' && e.to === 'q2');
      expect(q1ToQ2?.label).toContain('X');
      expect(q1ToQ2?.label).toContain('R');

      // Mixed halt edges (`q1 -> qH` writes Ⓨ R while `q2 -> qH` writes # S) should annotate on edges
      const q1ToHalt = schema.edges.find((e) => e.from === 'q1' && e.to === 'qH');
      expect(q1ToHalt?.label).toContain('Ⓨ');
    });
  });
});
