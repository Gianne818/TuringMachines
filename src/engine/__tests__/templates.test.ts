import { describe, expect, it } from 'vitest';
import { runSimulation } from '../simulator';
import { ALL_TEMPLATES } from '../../templates';

describe('All 24 Turing Machine Templates & Built-ins', () => {
  it('contains all 24 unique machine IDs', () => {
    expect(ALL_TEMPLATES).toHaveLength(24);
    const ids = new Set(ALL_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(24);
  });

  for (const machine of ALL_TEMPLATES) {
    describe(`${machine.name} (${machine.id})`, () => {
      for (const sample of machine.sampleInputs) {
        it(`runs "${sample.input}" -> "${sample.expectedOutput}"`, () => {
          const trace = runSimulation(machine, sample.input, 8000);
          expect(trace.status).not.toBe('step-limit');
          expect(trace.output).toBe(sample.expectedOutput);

          // Every machine parks its head on the # immediately after output,
          // except L_# (which intentionally seeks the # to the left) and E on two words (#a#bc# -> #a#[#]).
          const finalHead = trace.steps[trace.steps.length - 1].head;
          if (machine.id === 'builtin-l-hash' && sample.input === '#ab#cd#') {
            expect(finalHead).toBe(3);
          } else if (machine.id === 'builtin-l-hash' && sample.input === '#abc#') {
            expect(finalHead).toBe(0);
          } else if (machine.id === 'builtin-r-hash' && sample.input === '#ab#cd#') {
            expect(finalHead).toBe(3);
          } else if (machine.id === 'builtin-erase' && sample.input === '#a#bc#') {
            expect(finalHead).toBe(3);
          } else {
            expect(trace.headAtCanonicalEnd).toBe(true);
          }

          if (machine.kind === 'decider') {
            if (sample.verdict === 'accept') {
              expect(trace.status).toBe('accepted');
              expect(trace.output).toBe('#Ⓨ#');
            } else if (sample.verdict === 'reject') {
              expect(trace.status).toBe('rejected');
              expect(trace.output).toBe('#Ⓝ#');
            }
          }
        });
      }
    });
  }

  it('verifies additional edge cases across categories', () => {
    const find = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)!;

    // Monus un-delimited input normalization
    const monusUnwrapped = runSimulation(find('unary-monus'), 'III#II');
    expect(monusUnwrapped.output).toBe('#I#');
    expect(monusUnwrapped.headAtCanonicalEnd).toBe(true);

    // Monus 0 - 0
    const monusZero = runSimulation(find('unary-monus'), '###');
    expect(monusZero.output).toBe('#');
    expect(monusZero.headAtCanonicalEnd).toBe(true);

    // Multiplication 0 * 0
    const multZero = runSimulation(find('unary-multiply'), '###');
    expect(multZero.output).toBe('#');
    expect(multZero.headAtCanonicalEnd).toBe(true);

    // Multiplication 4 * 3 = 12
    const mult4x3 = runSimulation(find('unary-multiply'), '#IIII#III#', 10000);
    expect(mult4x3.output).toBe('#IIIIIIIIIIII#');
    expect(mult4x3.headAtCanonicalEnd).toBe(true);

    // Binary Divisible by 3: 1111 (15) accept, 1110 (14) reject
    expect(runSimulation(find('reg-div-3'), '#1111#').output).toBe('#Ⓨ#');
    expect(runSimulation(find('reg-div-3'), '#1110#').output).toBe('#Ⓝ#');

    // CFL a^n b^n tricky interleavings
    expect(runSimulation(find('cfl-anbn'), '#aabb#').output).toBe('#Ⓨ#');
    expect(runSimulation(find('cfl-anbn'), '#ba#').output).toBe('#Ⓝ#');
    expect(runSimulation(find('cfl-anbn'), '#aab#').output).toBe('#Ⓝ#');

    // Palindrome odd length & single bit
    expect(runSimulation(find('cfl-palindrome'), '#0#').output).toBe('#Ⓨ#');
    expect(runSimulation(find('cfl-palindrome'), '#1001#').output).toBe('#Ⓨ#');
    expect(runSimulation(find('cfl-palindrome'), '#110#').output).toBe('#Ⓝ#');

    // Balanced Parens tricky edge cases
    expect(runSimulation(find('cfl-parens'), '#((()))#').output).toBe('#Ⓨ#');
    expect(runSimulation(find('cfl-parens'), '#())#').output).toBe('#Ⓝ#');
    expect(runSimulation(find('cfl-parens'), '#(#').output).toBe('#Ⓝ#');

    // Bitwise XOR & AND unequal / zero edge cases
    expect(runSimulation(find('logic-xor'), '##101#').output).toBe('#101#');
    expect(runSimulation(find('logic-and'), '##101#').output).toBe('#000#');
    expect(runSimulation(find('logic-xor'), '###').output).toBe('#');

    // Context-sensitive a^n b^n c^n edge cases
    expect(runSimulation(find('tm-anbncn'), '#abbcc#').output).toBe('#Ⓝ#');
    expect(runSimulation(find('tm-anbncn'), '#acb#').output).toBe('#Ⓝ#');

    // S_R verifies actual rightward index shift even when output trims outer blanks
    const srTrace = runSimulation(find('builtin-shift-right'), '#abc#');
    const lastStep = srTrace.steps[srTrace.steps.length - 1];
    expect(lastStep.tape[1]).toBe('#');
    expect(lastStep.tape[2]).toBe('a');
    expect(lastStep.tape[3]).toBe('b');
    expect(lastStep.tape[4]).toBe('c');
    expect(lastStep.head).toBe(5);
  });
});
