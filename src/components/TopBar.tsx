import { motion, useReducedMotion } from 'motion/react';
import {
  Blocks,
  Columns2,
  Cpu,
  ListOrdered,
  Moon,
  PencilLine,
  RotateCcw,
  Sun,
  Workflow,
} from 'lucide-react';
import type { TuringMachineDefinition } from '../engine/types';

export type ViewMode = 'split' | 'diagram' | 'trace';

interface TopBarProps {
  activeMachine: TuringMachineDefinition;
  viewMode: ViewMode;
  resolvedTheme: 'light' | 'dark';
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenBuiltIns: () => void;
  onOpenEditor: () => void;
  onResetCustom?: () => void;
  onToggleTheme: () => void;
}

const VIEW_TABS: { id: ViewMode; label: string; icon: typeof Columns2 }[] = [
  { id: 'split', label: 'Split', icon: Columns2 },
  { id: 'diagram', label: 'Diagram', icon: Workflow },
  { id: 'trace', label: 'Step Trace', icon: ListOrdered },
];

export function TopBar({
  activeMachine,
  viewMode,
  resolvedTheme,
  onChangeViewMode,
  onOpenBuiltIns,
  onOpenEditor,
  onResetCustom,
  onToggleTheme,
}: TopBarProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <header
      className="glass-chrome sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b px-3.5 py-2.5 sm:px-5"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Left: Brand & Generated Machine Status Badge */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          <Cpu className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="text-sm font-bold tracking-tight sm:text-base"
            style={{ letterSpacing: '-0.02em', color: 'var(--ink-primary)' }}
          >
            Turing Studio
          </h1>
          <span
            className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--ink-secondary)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  activeMachine.kind === 'decider'
                    ? 'var(--accept)'
                    : 'var(--accent)',
              }}
              aria-hidden="true"
            />
            <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>
              {activeMachine.name}
            </span>
            <span className="tabular-nums" style={{ color: 'var(--ink-muted)' }}>
              · {activeMachine.states.length} states
            </span>
          </span>
        </div>
      </div>

      {/* Center: Apple-style Spring Segmented View Switcher */}
      <div
        className="flex items-center rounded-xl border p-0.5"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
        role="group"
        aria-label="Workspace layout"
      >
        {VIEW_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = viewMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChangeViewMode(tab.id)}
              className="pressable relative flex min-h-8 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold"
              style={{
                color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
              }}
            >
              {active && (
                <motion.span
                  layoutId="view-mode-pill"
                  transition={
                    prefersReducedMotion
                      ? { duration: 0.08 }
                      : { type: 'spring', bounce: 0, duration: 0.32 }
                  }
                  className="absolute inset-0 rounded-lg shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              )}
              <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Built-ins Viewer, Rule Editor, Restore & Theme Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenBuiltIns}
          className="pressable flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--ink-primary)',
          }}
          title="View Built-in Functions Diagrams (B)"
        >
          <Blocks className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <span>Built-ins</span>
        </button>

        <button
          type="button"
          onClick={onOpenEditor}
          className="pressable flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--ink-primary)',
          }}
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Edit Rules</span>
        </button>

        {activeMachine.isCustom && onResetCustom && (
          <button
            type="button"
            onClick={onResetCustom}
            className="pressable flex min-h-9 items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--halt-soft)',
              color: 'var(--halt)',
            }}
            title="Restore original template rules"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Restore</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--ink-secondary)',
          }}
          aria-label={
            resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          title={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
