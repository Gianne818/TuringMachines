import { describe, expect, it } from 'vitest';
import { parseFromDSL, serializeToDSL } from '../dsl';
import { runSimulation } from '../simulator';
import { findTemplateById } from '../../templates';

describe('Rule DSL serializer & parser', () => {
  it('round-trips Monus machine rules cleanly', () => {
    const monus = findTemplateById('unary-monus');
    const dsl = serializeToDSL(monus);
    const parsed = parseFromDSL(dsl, monus);

    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.transitions).toHaveLength(monus.transitions.length);

    const rebuilt = { ...monus, ...parsed };
    const trace = runSimulation(rebuilt, '#III#II#');
    expect(trace.output).toBe('#I#');
    expect(trace.headAtCanonicalEnd).toBe(true);
  });

  it('detects duplicate (state, read) rules and invalid moves', () => {
    const base = findTemplateById('unary-monus');
    const badDsl = [
      'start: q0',
      'halt: qH',
      'q0, # -> q1, #, L',
      'q0, # -> qH, #, R',
      'q1, I -> qH, I, X',
    ].join('\n');

    const parsed = parseFromDSL(badDsl, base);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThanOrEqual(2);
    expect(parsed.errors[0].line).toBe(4);
    expect(parsed.errors[1].line).toBe(5);
  });
});
