import { autoLayoutStates } from './layout';
import type { BuiltInId, Direction, StateNode, TransitionRule } from './types';

export interface CompiledBlock {
  entry: string;
  /** Connect exit from this block on `symbols` to `targetState`. */
  connect: (symbols: string[], targetState: string, move?: Direction) => void;
}

export class MacroCompiler {
  private states: StateNode[] = [];
  private transitions: TransitionRule[] = [];
  private counter = 0;
  private ruleCounter = 0;
  public readonly blank: string;
  public readonly workAlphabet: string[];
  public readonly fullAlphabet: string[];

  constructor(workAlphabet: string[], extraTapeSymbols: string[] = [], blankSymbol = '#') {
    this.blank = blankSymbol;
    this.workAlphabet = Array.from(new Set(workAlphabet.filter((s) => s !== blankSymbol)));
    this.fullAlphabet = Array.from(
      new Set([blankSymbol, ...this.workAlphabet, ...extraTapeSymbols]),
    );
  }

  public newState(label?: string, schemaNodeId?: string, macroPath?: string[]): string {
    const id = `q${this.counter}`;
    this.counter += 1;
    this.states.push({
      id,
      label,
      x: 0,
      y: 0,
      schemaNodeId,
      macroPath,
    });
    return id;
  }

  public addRule(
    from: string,
    read: string,
    to: string,
    write: string,
    move: Direction,
  ): void {
    this.transitions.push({
      id: `r${this.ruleCounter++}`,
      from,
      read,
      to,
      write,
      move,
    });
  }

  public addRules(
    from: string,
    reads: string[],
    to: string,
    writeSameOrFixed: string | 'SAME',
    move: Direction,
  ): void {
    for (const r of reads) {
      this.addRule(from, r, to, writeSameOrFixed === 'SAME' ? r : writeSameOrFixed, move);
    }
  }

  /** Primitive L or R step */
  public createMove(
    dir: 'L' | 'R',
    schemaNodeId?: string,
    macroPath?: string[],
  ): CompiledBlock {
    const entry = this.newState(dir, schemaNodeId, macroPath);
    const out = this.newState(`${dir}_done`, schemaNodeId, macroPath);
    this.addRules(entry, this.fullAlphabet, out, 'SAME', dir);
    return {
      entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(out, symbols, target, 'SAME', move);
      },
    };
  }

  /** Primitive write symbol `ch` without moving */
  public createWrite(
    ch: string,
    schemaNodeId?: string,
    macroPath?: string[],
  ): CompiledBlock {
    const entry = this.newState(`write_${ch}`, schemaNodeId, macroPath);
    const out = this.newState(`wrote_${ch}`, schemaNodeId, macroPath);
    this.addRules(entry, this.fullAlphabet, out, ch, 'S');
    return {
      entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(out, symbols, target, 'SAME', move);
      },
    };
  }

  /** L_# or R_#: move at least 1 cell in `dir`, loop while non-blank, exit on `#` */
  public createSeekBlank(
    dir: 'L' | 'R',
    schemaNodeId?: string,
    macroPath: string[] = [dir === 'L' ? 'L_#' : 'R_#'],
    subNodeIds?: { step?: string; scan?: string },
  ): CompiledBlock {
    const name = dir === 'L' ? 'L_#' : 'R_#';
    const entry = this.newState(`${name}_step`, subNodeIds?.step ?? schemaNodeId, macroPath);
    const scan = this.newState(`${name}_scan`, subNodeIds?.scan ?? schemaNodeId, macroPath);
    this.addRules(entry, this.fullAlphabet, scan, 'SAME', dir);
    this.addRules(scan, this.workAlphabet, scan, 'SAME', dir);
    return {
      entry,
      connect: (symbols, target, move = 'S') => {
        const filtered = symbols.includes(this.blank) ? [this.blank] : symbols;
        this.addRules(scan, filtered, target, 'SAME', move);
      },
    };
  }

  /** Erase (E): > L --(σ≠#)--> # -> L ; (#)--> R */
  public createErase(
    schemaNodeId?: string,
    macroPath: string[] = ['E'],
    subNodeIds?: { L?: string; writeBlank?: string; R?: string },
  ): CompiledBlock {
    const entry = this.newState('E_L', subNodeIds?.L ?? schemaNodeId, [...macroPath, 'L']);
    const check = this.newState('E_check', subNodeIds?.L ?? schemaNodeId, [...macroPath, 'check']);
    const erase = this.newState(
      'E_write_#',
      subNodeIds?.writeBlank ?? schemaNodeId,
      [...macroPath, '#'],
    );
    const done = this.newState('E_done', subNodeIds?.R ?? schemaNodeId, [...macroPath, 'R']);

    this.addRules(entry, this.fullAlphabet, check, 'SAME', 'L');
    this.addRules(check, this.workAlphabet, erase, this.blank, 'S');
    this.addRule(check, this.blank, done, this.blank, 'R');
    this.addRule(erase, this.blank, check, this.blank, 'L');

    return {
      entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(done, symbols, target, 'SAME', move);
      },
    };
  }

  /** Shift Left (S_L): > L_# -> R --(σ≠#)--> L -> σ -> R -> (loop R) ; (#)--> L -> # */
  public createShiftLeft(
    schemaNodeId?: string,
    macroPath: string[] = ['S_L'],
    subNodeIds?: {
      Lhash?: string;
      R1?: string;
      L?: string;
      sigma?: string;
      R2?: string;
      Lend?: string;
      blankEnd?: string;
    },
  ): CompiledBlock {
    const seekLeft = this.createSeekBlank(
      'L',
      subNodeIds?.Lhash ?? schemaNodeId,
      [...macroPath, 'L_#'],
    );
    const firstR = this.newState('SL_R', subNodeIds?.R1 ?? schemaNodeId, [...macroPath, 'R']);
    const check = this.newState('SL_check', subNodeIds?.R1 ?? schemaNodeId, [
      ...macroPath,
      'branch',
    ]);
    const wipeLast = this.newState('SL_wipe', subNodeIds?.Lend ?? schemaNodeId, [
      ...macroPath,
      'L',
    ]);
    const done = this.newState('SL_done', subNodeIds?.blankEnd ?? schemaNodeId, [
      ...macroPath,
      '#',
    ]);

    seekLeft.connect([this.blank], firstR, 'S');
    this.addRules(firstR, this.fullAlphabet, check, 'SAME', 'R');

    // Blank branch: L then write #
    this.addRule(check, this.blank, wipeLast, this.blank, 'L');
    this.addRules(wipeLast, this.fullAlphabet, done, this.blank, 'S');

    // Non-blank σ branch: L then write σ, R back to firstR
    for (const sigma of this.workAlphabet) {
      const writeSigma = this.newState(
        `SL_w_${sigma}`,
        subNodeIds?.sigma ?? subNodeIds?.L ?? schemaNodeId,
        [...macroPath, sigma],
      );
      this.addRule(check, sigma, writeSigma, sigma, 'L');
      this.addRules(writeSigma, this.fullAlphabet, firstR, sigma, 'R');
    }

    return {
      entry: seekLeft.entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(done, symbols, target, 'SAME', move);
      },
    };
  }

  /** Shift Right (S_R): > L --(σ≠#)--> R -> σ -> L -> (loop L) ; (#)--> R -> # -> R_# */
  public createShiftRight(
    schemaNodeId?: string,
    macroPath: string[] = ['S_R'],
    subNodeIds?: {
      L1?: string;
      R?: string;
      sigma?: string;
      L2?: string;
      Rend?: string;
      blankEnd?: string;
      Rhash?: string;
    },
  ): CompiledBlock {
    const entry = this.newState('SR_L', subNodeIds?.L1 ?? schemaNodeId, [...macroPath, 'L']);
    const check = this.newState('SR_check', subNodeIds?.L1 ?? schemaNodeId, [
      ...macroPath,
      'branch',
    ]);
    const backL = this.newState('SR_backL', subNodeIds?.L2 ?? schemaNodeId, [...macroPath, 'L']);
    const wipeFirst = this.newState('SR_wipe', subNodeIds?.Rend ?? schemaNodeId, [
      ...macroPath,
      'R',
    ]);
    const scanRight = this.newState('SR_R_scan', subNodeIds?.Rhash ?? schemaNodeId, [
      ...macroPath,
      'R_#',
    ]);
    const done = this.newState('SR_done', subNodeIds?.Rhash ?? schemaNodeId, [
      ...macroPath,
      'R_#',
    ]);

    this.addRules(entry, this.fullAlphabet, check, 'SAME', 'L');
    this.addRules(backL, this.fullAlphabet, check, 'SAME', 'L');

    // Non-blank σ branch: R -> write σ & L -> backL
    for (const sigma of this.workAlphabet) {
      const writeSigma = this.newState(
        `SR_w_${sigma}`,
        subNodeIds?.sigma ?? subNodeIds?.R ?? schemaNodeId,
        [...macroPath, sigma],
      );
      this.addRule(check, sigma, writeSigma, sigma, 'R');
      this.addRules(writeSigma, this.fullAlphabet, backL, sigma, 'L');
    }

    // Blank branch: R -> write # and move R to R_#_scan -> scan until #
    this.addRule(check, this.blank, wipeFirst, this.blank, 'R');
    this.addRules(wipeFirst, this.fullAlphabet, scanRight, this.blank, 'R');
    this.addRules(scanRight, this.workAlphabet, scanRight, 'SAME', 'R');
    this.addRule(scanRight, this.blank, done, this.blank, 'S');

    return {
      entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(done, symbols, target, 'SAME', move);
      },
    };
  }

  /** Copy (C): > L_# -> R --(σ≠#)--> # -> R_# -> R_# -> σ -> L_# -> L_# -> σ -> (loop R) ; (#)--> R_# */
  public createCopy(
    schemaNodeId?: string,
    macroPath: string[] = ['C'],
    subNodeIds?: {
      Lhash?: string;
      R?: string;
      mark?: string;
      r1?: string;
      r2?: string;
      w1?: string;
      l1?: string;
      l2?: string;
      w2?: string;
      end?: string;
    },
  ): CompiledBlock {
    const seekLeft = this.createSeekBlank(
      'L',
      subNodeIds?.Lhash ?? schemaNodeId,
      [...macroPath, 'L_#'],
    );
    const firstR = this.newState('C_R', subNodeIds?.R ?? schemaNodeId, [...macroPath, 'R']);
    const check = this.newState('C_check', subNodeIds?.R ?? schemaNodeId, [
      ...macroPath,
      'branch',
    ]);
    const finalScan = this.createSeekBlank(
      'R',
      subNodeIds?.end ?? schemaNodeId,
      [...macroPath, 'R_#'],
    );
    const done = this.newState('C_done', subNodeIds?.end ?? schemaNodeId, [
      ...macroPath,
      'R_#',
    ]);

    seekLeft.connect([this.blank], firstR, 'S');
    this.addRules(firstR, this.fullAlphabet, check, 'SAME', 'R');
    this.addRule(check, this.blank, finalScan.entry, this.blank, 'S');
    finalScan.connect([this.blank], done, 'S');

    for (const sigma of this.workAlphabet) {
      const path = [...macroPath, sigma];
      const mark = this.newState(`C_${sigma}_mark`, subNodeIds?.mark ?? schemaNodeId, [
        ...path,
        '#',
      ]);
      const r1 = this.createSeekBlank('R', subNodeIds?.r1 ?? schemaNodeId, [...path, 'R_# (1)']);
      const r2 = this.createSeekBlank('R', subNodeIds?.r2 ?? schemaNodeId, [...path, 'R_# (2)']);
      const writeCopy = this.newState(`C_${sigma}_write`, subNodeIds?.w1 ?? schemaNodeId, [
        ...path,
        `write ${sigma}`,
      ]);
      const l1 = this.createSeekBlank('L', subNodeIds?.l1 ?? schemaNodeId, [...path, 'L_# (1)']);
      const l2 = this.createSeekBlank('L', subNodeIds?.l2 ?? schemaNodeId, [...path, 'L_# (2)']);
      const restore = this.newState(`C_${sigma}_restore`, subNodeIds?.w2 ?? schemaNodeId, [
        ...path,
        `restore ${sigma}`,
      ]);

      this.addRule(check, sigma, mark, this.blank, 'S');
      this.addRule(mark, this.blank, r1.entry, this.blank, 'S');
      r1.connect([this.blank], r2.entry, 'S');
      r2.connect([this.blank], writeCopy, 'S');
      this.addRules(writeCopy, this.fullAlphabet, l1.entry, sigma, 'S');
      l1.connect([this.blank], l2.entry, 'S');
      l2.connect([this.blank], restore, 'S');
      this.addRules(restore, this.fullAlphabet, firstR, sigma, 'S');
    }

    return {
      entry: seekLeft.entry,
      connect: (symbols, target, move = 'S') => {
        this.addRules(done, symbols, target, 'SAME', move);
      },
    };
  }

  public createBuiltIn(
    builtinId: BuiltInId,
    schemaNodeId?: string,
    macroPath?: string[],
  ): CompiledBlock {
    switch (builtinId) {
      case 'L_hash':
        return this.createSeekBlank('L', schemaNodeId, macroPath);
      case 'R_hash':
        return this.createSeekBlank('R', schemaNodeId, macroPath);
      case 'E':
        return this.createErase(schemaNodeId, macroPath);
      case 'S_L':
        return this.createShiftLeft(schemaNodeId, macroPath);
      case 'S_R':
        return this.createShiftRight(schemaNodeId, macroPath);
      case 'C':
        return this.createCopy(schemaNodeId, macroPath);
    }
  }

  public finalize(
    startState: string,
    haltStates: string[],
    layoutOpts?: { colGap?: number; rowGap?: number },
  ): {
    startState: string;
    haltStates: string[];
    states: StateNode[];
    transitions: TransitionRule[];
  } {
    const haltSet = new Set(haltStates);
    const tagged = this.states.map((s) => ({
      ...s,
      isStart: s.id === startState,
      isHalt: haltSet.has(s.id),
    }));
    const laidOut = autoLayoutStates(tagged, this.transitions, startState, layoutOpts);
    return {
      startState,
      haltStates,
      states: laidOut,
      transitions: this.transitions,
    };
  }
}
