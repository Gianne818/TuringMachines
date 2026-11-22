import { describe, expect, it } from 'vitest';
import {
  createInitialTapeState,
  normalizeTapeInterior,
  runSimulation,
} from '../simulator';
import type { TuringMachineDefinition } from '../types';

describe('normalizeTapeInterior & createInitialTapeState', () => {
  it('preserves interior between outer # delimiters', () => {
    expect(normalizeTapeInterior('#III#II#', '#')).toBe('III#II');
    expect(normalizeTapeInterior('#III##', '#')).toBe('III#');
    expect(normalizeTapeInterior('##II#', '#')).toBe('#II');
    expect(normalizeTapeInterior('###', '#')).toBe('#');
    expect(normalizeTapeInterior('#', '#')).toBe('');
    expect(normalizeTapeInterior('', '#')).toBe('');
  });

  it('normalizes un-delimited or partially-delimited inputs cleanly', () => {
    expect(normalizeTapeInterior('III#II', '#')).toBe('III#II');
    expect(normalizeTapeInterior('#III', '#')).toBe('III');
    expect(normalizeTapeInterior('III#', '#')).toBe('III');
  });

  it('places trailing-blank head on # immediately after input', () => {
    const init = createInitialTapeState('#III#II#', {
      blankSymbol: '#',
      initialHead: 'trailing-blank',
    });
    expect(init.normalizedInput).toBe('#III#II#');
    expect(init.head).toBe(7);
    expect(init.tape[0]).toBe('#');
    expect(init.tape[1]).toBe('I');
    expect(init.tape[4]).toBe('#');
    expect(init.tape[7]).toBe('#');
  });

  it('places leading-blank head on # immediately before input', () => {
    const init = createInitialTapeState('#abc#', {
      blankSymbol: '#',
      initialHead: 'leading-blank',
    });
    expect(init.head).toBe(0);
    expect(init.tape[0]).toBe('#');
    expect(init.tape[1]).toBe('a');
    expect(init.tape[4]).toBe('#');
  });
});

describe('runSimulation core mechanics', () => {
  it('enforces maxSteps guard on non-halting loop machines', () => {
    const looper: TuringMachineDefinition = {
      id: 'test-loop',
      name: 'Infinite Loop',
      category: 'classic-tm',
      kind: 'transducer',
      description: 'Loops right forever',
      algorithmSummary: 'Loops right forever',
      inputFormat: '#w#',
      blankSymbol: '#',
      inputAlphabet: ['I'],
      tapeAlphabet: ['#', 'I'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH'],
      states: [
        { id: 'q0', x: 0, y: 0, isStart: true },
        { id: 'qH', x: 100, y: 0, isHalt: true },
      ],
      transitions: [
        { id: 't1', from: 'q0', read: '#', to: 'q0', write: 'I', move: 'R' },
      ],
      sampleInputs: [],
    };

    const trace = runSimulation(looper, '#', 50);
    expect(trace.status).toBe('step-limit');
    expect(trace.totalSteps).toBe(50);
    expect(trace.steps).toHaveLength(51);
  });

  it('handles infinite leftward tape expansion seamlessly', () => {
    const goLeft: TuringMachineDefinition = {
      id: 'test-left',
      name: 'Left Expansion',
      category: 'classic-tm',
      kind: 'transducer',
      description: 'Writes A to the left of index 0',
      algorithmSummary: 'Writes A to negative tape indices',
      inputFormat: '#',
      blankSymbol: '#',
      inputAlphabet: [],
      tapeAlphabet: ['#', 'A'],
      initialHead: 'trailing-blank',
      startState: 'q0',
      haltStates: ['qH'],
      states: [
        { id: 'q0', x: 0, y: 0, isStart: true },
        { id: 'q1', x: 100, y: 0 },
        { id: 'q2', x: 200, y: 0 },
        { id: 'qH', x: 300, y: 0, isHalt: true },
      ],
      transitions: [
        { id: 'l1', from: 'q0', read: '#', to: 'q1', write: '#', move: 'L' },
        { id: 'l2', from: 'q1', read: '#', to: 'q2', write: '#', move: 'L' },
        { id: 'l3', from: 'q2', read: '#', to: 'qH', write: 'A', move: 'R' },
      ],
      sampleInputs: [],
    };

    const trace = runSimulation(goLeft, '#');
    expect(trace.output).toBe('#A#');
    expect(trace.headAtCanonicalEnd).toBe(true);
  });
});
