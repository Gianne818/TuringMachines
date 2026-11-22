import { useEffect, useRef } from 'react';
import { ArrowRight, Play, X } from 'lucide-react';
import type { BuiltInId, TuringMachineDefinition } from '../engine/types';
import { BUILTIN_BY_ID } from '../templates';
import { attachDialogLightDismiss, closeDialogWithFallback } from '../utils/dialogHelpers';
import { renderLpHtmlLabel, SchemaDiagramCanvas } from './SchemaDiagramCanvas';

interface BuiltInFunctionsDialogProps {
  open: boolean;
  focusedId: BuiltInId | null;
  onClose: () => void;
  onLoadMachine: (machine: TuringMachineDefinition) => void;
}

const BUILTIN_SPECS: {
  id: BuiltInId;
  signature: string;
  badge: string;
}[] = [
  { id: 'S_L', signature: '#u#v[#] → #uv[#]', badge: 'Shift Left' },
  { id: 'S_R', signature: '#w[#] → ##w[#]', badge: 'Shift Right' },
  { id: 'C', signature: '#w[#] → #w#w[#]', badge: 'Copy' },
  { id: 'E', signature: '#w[#] → #[#]', badge: 'Erase' },
  { id: 'L_hash', signature: '#w[#] → [#]w#', badge: 'Scan Left' },
  { id: 'R_hash', signature: '[#]w# → #w[#]', badge: 'Scan Right' },
];

export function BuiltInFunctionsDialog({
  open,
  focusedId,
  onClose,
  onLoadMachine,
}: BuiltInFunctionsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cardRefs = useRef<Partial<Record<BuiltInId, HTMLElement | null>>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (focusedId && cardRefs.current[focusedId]) {
        requestAnimationFrame(() => {
          cardRefs.current[focusedId]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        });
      }
    } else if (dialog.open) {
      void closeDialogWithFallback(dialog);
    }
  }, [open, focusedId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);
    const cleanupDismiss = attachDialogLightDismiss(dialog, () => {
      void closeDialogWithFallback(dialog, onClose);
    });

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanupDismiss();
    };
  }, [onClose]);

  const requestClose = () => {
    void closeDialogWithFallback(dialogRef.current, onClose);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="builtins-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
      className="w-[min(1040px,calc(100vw-2rem))] rounded-3xl p-0 shadow-2xl"
    >
      <div className="flex max-h-[86dvh] flex-col">
        {/* Header */}
        <header
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2
              id="builtins-dialog-title"
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--ink-primary)' }}
            >
              Built-in Turing Machine Functions (Lewis & Papadimitriou)
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Primitive building blocks used to compose larger machines. Load any function to step through its execution on the tape.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            autoFocus
            className="pressable rounded-xl border p-2"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--ink-secondary)',
            }}
            aria-label="Close built-in functions dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 2-Column Grid of Diagrams inside dedicated scroll container */}
        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {BUILTIN_SPECS.map((spec) => {
              const machine = BUILTIN_BY_ID[spec.id];
              const isFocused = focusedId === spec.id;

              return (
                <article
                  key={spec.id}
                  ref={(el) => {
                    cardRefs.current[spec.id] = el;
                  }}
                  className="flex flex-col rounded-2xl border transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: isFocused ? 'var(--accent)' : 'var(--border-subtle)',
                    boxShadow: isFocused ? '0 0 0 2px var(--accent-soft)' : undefined,
                  }}
                >
                  <div
                    className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div>
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: 'var(--ink-primary)' }}
                      >
                        {renderLpHtmlLabel(machine.name)}
                      </h3>
                      <div
                        className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums"
                        style={{ color: 'var(--accent)' }}
                      >
                        <span>{spec.signature}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onLoadMachine(machine);
                        requestClose();
                      }}
                      className="pressable flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-ink)',
                      }}
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      <span>Load</span>
                    </button>
                  </div>

                  {/* Diagram canvas */}
                  {machine.schemaDiagram && (
                    <div
                      className="diagram-grid h-52 min-h-[196px] shrink-0 overflow-hidden border-b px-3 py-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <SchemaDiagramCanvas schema={machine.schemaDiagram} compact />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5 text-xs">
                    <p className="leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                      {machine.description}
                    </p>
                    {machine.sampleInputs[0] && (
                      <div
                        className="flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-[11px] font-medium tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        <span>Sample: {machine.sampleInputs[0].input}</span>
                        <span
                          className="flex items-center gap-1 font-semibold"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          {machine.sampleInputs[0].expectedOutput}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </dialog>
  );
}
