import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { readCell } from '../engine/simulator';
import type {
  ExecutionStep,
  SimulationTrace,
  TuringMachineDefinition,
} from '../engine/types';
import { renderLpHtmlLabel, resolveStepActionLabel } from './SchemaDiagramCanvas';

export type PlaybackSpeed = 0.5 | 1 | 3 | 10 | 25;

interface TapeStageProps {
  machine: TuringMachineDefinition;
  inputValue: string;
  onApplyInput: (value: string) => void;
  trace: SimulationTrace;
  currentStepIndex: number;
  currentStep: ExecutionStep;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  onJumpEnd: () => void;
  onScrub: (step: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
}

const CELL_WIDTH = 52;
const CELL_GAP = 6;
const CELL_PITCH = CELL_WIDTH + CELL_GAP;
const SPEEDS: PlaybackSpeed[] = [0.5, 1, 3, 10, 25];

export function TapeStage({
  machine,
  inputValue,
  onApplyInput,
  trace,
  currentStepIndex,
  currentStep,
  isPlaying,
  speed,
  onTogglePlay,
  onStepForward,
  onStepBack,
  onReset,
  onJumpEnd,
  onScrub,
  onChangeSpeed,
}: TapeStageProps) {
  const prefersReducedMotion = useReducedMotion();
  const [draftInput, setDraftInput] = useState(inputValue);
  const [panOffset, setPanOffset] = useState(0);

  useEffect(() => {
    setDraftInput(inputValue);
  }, [inputValue]);

  // Recenter head automatically whenever step advances or resets
  useEffect(() => {
    setPanOffset(0);
  }, [currentStepIndex, machine.id, inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyInput(draftInput);
  };

  const blank = machine.blankSymbol || '#';
  const viewCenterCell = Math.round(currentStep.head - panOffset / CELL_PITCH);
  const spanMin = Math.min(currentStep.minIndex - 4, viewCenterCell - 14);
  const spanMax = Math.max(currentStep.maxIndex + 4, viewCenterCell + 14);

  const cells: number[] = [];
  for (let i = spanMin; i <= spanMax; i += 1) {
    cells.push(i);
  }

  const isAtEnd = currentStepIndex >= trace.totalSteps;
  const isAtStart = currentStepIndex <= 0;

  // Status badge styling
  let statusLabel = 'Ready';
  let statusBg = 'var(--bg-elevated)';
  let statusInk = 'var(--ink-secondary)';
  let StatusIcon = Sparkles;

  if (isPlaying) {
    statusLabel = 'Running';
    statusBg = 'var(--accent-soft)';
    statusInk = 'var(--accent)';
  } else if (isAtEnd && trace.totalSteps > 0) {
    if (trace.status === 'accepted') {
      statusLabel = `Accepted · ${trace.output}`;
      statusBg = 'var(--accept-soft)';
      statusInk = 'var(--accept)';
      StatusIcon = CheckCircle2;
    } else if (trace.status === 'rejected') {
      statusLabel = `Rejected · ${trace.output}`;
      statusBg = 'var(--reject-soft)';
      statusInk = 'var(--reject)';
      StatusIcon = XCircle;
    } else if (trace.status === 'step-limit') {
      statusLabel = `Step Limit (${trace.totalSteps})`;
      statusBg = 'var(--reject-soft)';
      statusInk = 'var(--reject)';
      StatusIcon = XCircle;
    } else {
      statusLabel = `Halted · ${trace.output}`;
      statusBg = 'var(--halt-soft)';
      statusInk = 'var(--halt)';
      StatusIcon = CheckCircle2;
    }
  } else if (isAtEnd && trace.totalSteps === 0 && machine.haltStates.includes(currentStep.state)) {
    statusLabel = `Halted · ${trace.output}`;
    statusBg = 'var(--halt-soft)';
    statusInk = 'var(--halt)';
    StatusIcon = CheckCircle2;
  } else if (currentStepIndex > 0) {
    statusLabel = `Paused · Step ${currentStepIndex}`;
    statusBg = 'var(--accent-soft)';
    statusInk = 'var(--accent)';
  }

  const moveGlyph =
    currentStep.appliedRule?.move === 'L'
      ? '←'
      : currentStep.appliedRule?.move === 'R'
        ? '→'
        : currentStep.appliedRule?.move === 'S'
          ? '·'
          : null;

  const headActionLabel = resolveStepActionLabel(machine, currentStep);

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border p-3.5 sm:p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Tape and Execution Controls"
    >
      {/* Top Row: Input Editor + Sample Chips */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <label htmlFor="tm-tape-input" className="sr-only">
            Tape Input String
          </label>
          <div className="relative flex items-center">
            <input
              id="tm-tape-input"
              type="text"
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              placeholder={machine.sampleInputs[0]?.input ?? '#III#II#'}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              className="min-h-9 w-48 rounded-xl border px-3 py-1.5 text-sm font-medium tracking-wide sm:w-60"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
          </div>
          <button
            type="submit"
            className="pressable min-h-9 rounded-xl px-3.5 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Load Tape
          </button>
          <span
            className="rounded-lg border px-2 py-1 text-[11px] font-medium"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-muted)',
              backgroundColor: 'var(--bg-elevated)',
            }}
            title={`Blank symbol is ${blank}. Initial head starts at ${
              machine.initialHead === 'leading-blank' ? '[#]w#' : '#w[#]'
            }.`}
          >
            {machine.initialHead === 'leading-blank' ? '[#]w#' : '#w[#]'} · Blank {blank}
          </span>
        </form>

        {/* Sample Input Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
            Presets:
          </span>
          {machine.sampleInputs.map((sample) => {
            const isSelected = trace.normalizedInput === sample.input || inputValue === sample.input;
            return (
              <button
                key={`${sample.label}-${sample.input}`}
                type="button"
                onClick={() => {
                  setDraftInput(sample.input);
                  onApplyInput(sample.input);
                }}
                className="pressable rounded-lg border px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isSelected ? 'var(--accent)' : 'var(--ink-secondary)',
                }}
                title={`${sample.input} → ${sample.expectedOutput}`}
              >
                <span>{sample.label}</span>
                <span className="ml-1.5 text-[11px] font-medium opacity-75">{sample.input}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Animated Infinite Tape */}
      <div
        className="relative overflow-hidden rounded-xl border py-4"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Stationary Head Capsule centered above active cell */}
        <div className="pointer-events-none relative z-10 mb-2 flex justify-center">
          <div
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--accent)',
              color: 'var(--ink-primary)',
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  isAtEnd && trace.status === 'accepted'
                    ? 'var(--accept)'
                    : isAtEnd && trace.status === 'rejected'
                      ? 'var(--reject)'
                      : 'var(--accent)',
              }}
            />
            <span className="text-xs font-bold">
              {renderLpHtmlLabel(headActionLabel)}
            </span>
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{ color: 'var(--ink-muted)' }}
              aria-hidden="true"
            >
              {moveGlyph && moveGlyph !== '·' ? `· ${moveGlyph}` : '·'} idx {currentStep.head}
            </span>
          </div>
        </div>

        {/* Center pointer chevron */}
        <div
          className="pointer-events-none absolute left-1/2 top-[43px] z-10 -translate-x-1/2"
          aria-hidden="true"
        >
          <div
            className="h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent"
            style={{ borderTopColor: 'var(--accent)' }}
          />
        </div>

        {/* Edge fade masks */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10"
          style={{
            background: 'linear-gradient(to right, var(--bg-canvas), transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10"
          style={{
            background: 'linear-gradient(to left, var(--bg-canvas), transparent)',
          }}
        />

        {/* Peek Left / Peek Right buttons */}
        <button
          type="button"
          onClick={() => setPanOffset((p) => p + CELL_PITCH * 3)}
          className="pressable glass-chrome absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-lg border p-1.5 shadow-sm"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-secondary)' }}
          aria-label="Peek tape left"
          title="Peek tape left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPanOffset((p) => p - CELL_PITCH * 3)}
          className="pressable glass-chrome absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-lg border p-1.5 shadow-sm"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-secondary)' }}
          aria-label="Peek tape right"
          title="Peek tape right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {panOffset !== 0 && (
          <button
            type="button"
            onClick={() => setPanOffset(0)}
            className="pressable glass-chrome absolute bottom-2 right-12 z-20 flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium shadow-sm"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Crosshair className="h-3 w-3" />
            Center Head
          </button>
        )}

        {/* Spring-centered Tape Track */}
        <div className="relative h-[74px] w-full">
          <motion.div
            className="absolute left-1/2 top-0 h-full"
            animate={{ x: -currentStep.head * CELL_PITCH + panOffset }}
            transition={
              prefersReducedMotion
                ? { duration: 0.08 }
                : { type: 'spring', bounce: 0, duration: 0.3 }
            }
          >
            {cells.map((idx) => {
              const sym = readCell(currentStep.tape, idx, blank);
              const isHead = idx === currentStep.head;
              const isBlank = sym === blank;
              const isWritten = currentStep.writtenIndex === idx;
              const isAcceptSym = sym === 'Ⓨ';
              const isRejectSym = sym === 'Ⓝ';

              return (
                <div
                  key={idx}
                  style={{ left: idx * CELL_PITCH - CELL_WIDTH / 2, width: CELL_WIDTH }}
                  className="absolute top-0 flex flex-col items-center"
                >
                  <span
                    className="mb-1 text-[10px] tabular-nums"
                    style={{
                      color: isHead ? 'var(--accent)' : 'var(--ink-muted)',
                      fontWeight: isHead ? 700 : 500,
                    }}
                  >
                    {idx}
                  </span>
                  <div
                    className="flex h-[50px] w-[52px] items-center justify-center rounded-xl border text-lg font-bold tabular-nums transition-colors duration-150"
                    style={{
                      backgroundColor: isAcceptSym
                        ? 'var(--accept-soft)'
                        : isRejectSym
                          ? 'var(--reject-soft)'
                          : isHead
                            ? 'var(--tape-active)'
                            : isBlank
                              ? 'var(--tape-blank)'
                              : 'var(--tape-cell)',
                      borderColor: isAcceptSym
                        ? 'var(--accept)'
                        : isRejectSym
                          ? 'var(--reject)'
                          : isHead
                            ? 'var(--accent)'
                            : isWritten
                              ? 'var(--halt)'
                              : 'var(--border-subtle)',
                      borderWidth: isHead || isWritten ? '2px' : '1px',
                      color: isAcceptSym
                        ? 'var(--accept)'
                        : isRejectSym
                          ? 'var(--reject)'
                          : isBlank
                            ? 'var(--ink-muted)'
                            : 'var(--ink-primary)',
                      boxShadow: isHead
                        ? '0 4px 14px -2px var(--accent-soft)'
                        : undefined,
                    }}
                  >
                    {sym}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* Bottom Row: Transport Dock, Scrubber, Speed, & Result Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            disabled={isAtStart && !isPlaying}
            className="pressable flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-medium disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-primary)',
            }}
            aria-label="Reset to step 0 (R)"
            title="Reset (R)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={onStepBack}
            disabled={isAtStart}
            className="pressable flex h-9 w-9 items-center justify-center rounded-xl border disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-primary)',
            }}
            aria-label="Step back (Left Arrow)"
            title="Step Back (←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="pressable flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold shadow-sm"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
            aria-label={isPlaying ? 'Pause simulation (Space)' : 'Play simulation (Space)'}
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>{isAtEnd ? 'Replay' : 'Play'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onStepForward}
            disabled={isAtEnd}
            className="pressable flex h-9 w-9 items-center justify-center rounded-xl border disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-primary)',
            }}
            aria-label="Step forward (Right Arrow)"
            title="Step Forward (→)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onJumpEnd}
            disabled={isAtEnd}
            className="pressable flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-medium disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-primary)',
            }}
            aria-label="Run to halt"
            title="Jump to Halt"
          >
            <SkipForward className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Run to Halt</span>
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="flex min-w-[180px] flex-1 items-center gap-2.5 sm:max-w-sm">
          <input
            type="range"
            min={0}
            max={Math.max(0, trace.totalSteps)}
            value={currentStepIndex}
            onChange={(e) => onScrub(Number(e.target.value))}
            disabled={trace.totalSteps === 0}
            aria-label="Execution timeline scrubber"
            className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
          />
          <span
            className="min-w-[82px] text-right text-xs font-semibold tabular-nums"
            style={{ color: 'var(--ink-secondary)' }}
          >
            {currentStepIndex} / {trace.totalSteps}
          </span>
        </div>

        {/* Speed Selector & Result Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-xl border p-0.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            role="group"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => onChangeSpeed(s)}
                className="pressable rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor: speed === s ? 'var(--bg-surface)' : 'transparent',
                  color: speed === s ? 'var(--accent)' : 'var(--ink-muted)',
                  boxShadow: speed === s ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
                }}
              >
                {s}×
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: statusBg,
              borderColor: 'var(--border-subtle)',
              color: statusInk,
            }}
            role="status"
            aria-live="polite"
          >
            <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>

          {isAtEnd && trace.headAtCanonicalEnd && (
            <span
              className="hidden items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium xl:inline-flex"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--ink-muted)',
                backgroundColor: 'var(--bg-elevated)',
              }}
              title="Output matches canonical #w# format with head parked at the # immediately after w."
            >
              <span>Head at trailing #</span>
              <Check className="h-3 w-3" style={{ color: 'var(--accept)' }} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
