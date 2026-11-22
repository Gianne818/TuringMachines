import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Info, ListOrdered, Table2 } from 'lucide-react';
import { buildTransitionLookup, findTransition, readCell } from '../engine/simulator';
import type {
  ExecutionStep,
  SimulationTrace,
  TuringMachineDefinition,
} from '../engine/types';
import {
  formatLpUnicodeLabel,
  renderLpHtmlLabel,
  resolveStepActionLabel,
} from './SchemaDiagramCanvas';

interface TracePanelProps {
  machine: TuringMachineDefinition;
  trace: SimulationTrace;
  currentStepIndex: number;
  currentStep: ExecutionStep;
  selectedStateId: string | null;
  onSelectStep: (stepIndex: number) => void;
  onSelectState: (stateId: string | null) => void;
  onApplySample: (input: string) => void;
}

type TraceTab = 'trace' | 'rules' | 'about';

function renderInlineTape(step: ExecutionStep, blank: string) {
  const keys = Object.keys(step.tape).map(Number);
  const nonBlanks = keys.filter((idx) => (step.tape[idx] ?? blank) !== blank);
  const spanMin = nonBlanks.length > 0 ? Math.min(...nonBlanks, step.head) : Math.min(step.head, 0);
  const spanMax = nonBlanks.length > 0 ? Math.max(...nonBlanks, step.head) : Math.max(step.head, 0);
  const lo = Math.max(step.minIndex, spanMin - 1);
  const hi = Math.min(step.maxIndex, spanMax + 1);

  const leftChars: string[] = [];
  const rightChars: string[] = [];
  for (let i = lo; i < step.head; i += 1) {
    leftChars.push(readCell(step.tape, i, blank));
  }
  const headSym = readCell(step.tape, step.head, blank);
  for (let i = step.head + 1; i <= hi; i += 1) {
    rightChars.push(readCell(step.tape, i, blank));
  }

  return (
    <span className="inline-flex items-center whitespace-nowrap text-xs font-medium tracking-wide tabular-nums">
      <span style={{ color: 'var(--ink-secondary)' }}>{leftChars.join('')}</span>
      <span
        className="mx-0.5 rounded px-1 py-0.5 font-bold"
        style={{
          backgroundColor: 'var(--accent-soft)',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
        }}
      >
        {headSym}
      </span>
      <span style={{ color: 'var(--ink-secondary)' }}>{rightChars.join('')}</span>
    </span>
  );
}

export function TracePanel({
  machine,
  trace,
  currentStepIndex,
  currentStep,
  selectedStateId,
  onSelectStep,
  onSelectState,
  onApplySample,
}: TracePanelProps) {
  const [tab, setTab] = useState<TraceTab>('trace');
  const [copied, setCopied] = useState(false);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  const blank = machine.blankSymbol || '#';

  const lookup = useMemo(
    () => buildTransitionLookup(machine.transitions),
    [machine.transitions],
  );
  const headSymbol = readCell(currentStep.tape, currentStep.head, blank);
  const nextRule = machine.haltStates.includes(currentStep.state)
    ? undefined
    : findTransition(lookup, currentStep.state, headSymbol);

  useEffect(() => {
    if (tab === 'trace' && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'auto',
      });
    }
  }, [currentStepIndex, tab]);

  const copyTraceMarkdown = async () => {
    const header = `| Step | Operation | Tape Action | Tape ID |\n| ---: | :--- | :--- | :--- |`;
    const rows = trace.steps.map((s) => {
      const opLabel = formatLpUnicodeLabel(resolveStepActionLabel(machine, s));
      const actionText = s.appliedRule
        ? `${s.appliedRule.read} → ${s.appliedRule.write}, ${s.appliedRule.move}`
        : 'Initial';
      return `| ${s.step} | ${opLabel} | ${actionText} | \`${s.idString}\` |`;
    });
    const text = `### ${machine.name} — Trace (${trace.normalizedInput} → ${trace.output})\n\n${header}\n${rows.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in restricted contexts
    }
  };

  return (
    <section
      className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Execution Trace and Formal Definition"
    >
      {/* Panel Header & Tabs */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="flex items-center rounded-xl border p-0.5"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
          role="tablist"
          aria-label="Inspector tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'trace'}
            onClick={() => setTab('trace')}
            className="pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: tab === 'trace' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'trace' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              boxShadow: tab === 'trace' ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Step Trace ({trace.totalSteps})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rules'}
            onClick={() => setTab('rules')}
            className="pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: tab === 'rules' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'rules' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              boxShadow: tab === 'rules' ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Rules δ ({machine.transitions.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'about'}
            onClick={() => setTab('about')}
            className="pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: tab === 'about' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'about' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              boxShadow: tab === 'about' ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Formal 7-Tuple</span>
          </button>
        </div>

        {tab === 'trace' && (
          <button
            type="button"
            onClick={copyTraceMarkdown}
            className="pressable flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: copied ? 'var(--accept)' : 'var(--ink-secondary)',
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied MD' : 'Copy Trace'}</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      {tab === 'trace' && (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="trace-table-caption"
          className="trace-table-wrapper custom-scroll flex-1 p-2"
        >
          <table className="trace-table text-left text-xs">
            <caption id="trace-table-caption" className="sr-only">
              Step-by-step Turing Machine execution trace. Click any row to jump to that step.
            </caption>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--ink-muted)',
                }}
              >
                <th scope="col" className="rounded-l-lg px-3 py-2 font-semibold">Step</th>
                <th scope="col" className="px-3 py-2 font-semibold">Operation</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tape Action</th>
                <th scope="col" className="rounded-r-lg px-3 py-2 font-semibold">Tape Configuration</th>
              </tr>
            </thead>
            <tbody>
              {trace.steps.map((step) => {
                const isActive = step.step === currentStepIndex;
                const actionLabel = resolveStepActionLabel(machine, step);
                return (
                  <tr
                    key={step.step}
                    ref={isActive ? activeRowRef : undefined}
                    onClick={() => onSelectStep(step.step)}
                    className="cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <th
                      scope="row"
                      className="border-b px-3 py-2 font-semibold tabular-nums"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: isActive ? 'var(--accent)' : 'var(--ink-muted)',
                      }}
                    >
                      #{step.step}
                    </th>
                    <td
                      data-label="Operation"
                      className="border-b px-3 py-2 font-semibold whitespace-nowrap"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: isActive ? 'var(--accent)' : 'var(--ink-primary)',
                      }}
                    >
                      {renderLpHtmlLabel(actionLabel)}
                    </td>
                    <td
                      data-label="Tape Action"
                      className="border-b px-3 py-2 text-[11px] font-medium whitespace-nowrap tabular-nums"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {step.appliedRule ? (
                        <span>
                          {step.appliedRule.read} → {step.appliedRule.write}, {step.appliedRule.move}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-muted)' }}>Initial config</span>
                      )}
                    </td>
                    <td
                      data-label="Tape"
                      className="border-b px-3 py-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {renderInlineTape(step, blank)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rules' && (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="rules-table-caption"
          className="trace-table-wrapper custom-scroll flex-1 p-2"
        >
          {selectedStateId && (
            <div
              className="mb-2 flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs"
              style={{
                borderColor: 'var(--accent)',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <span>
                Filtering rules touching state{' '}
                <strong className="font-semibold">{selectedStateId}</strong>
              </span>
              <button
                type="button"
                onClick={() => onSelectState(null)}
                className="font-semibold underline"
              >
                Show all
              </button>
            </div>
          )}

          <table className="trace-table text-left text-xs">
            <caption id="rules-table-caption" className="sr-only">
              Deterministic transition function δ table
            </caption>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--ink-muted)',
                }}
              >
                <th scope="col" className="rounded-l-lg px-3 py-2 font-semibold">State</th>
                <th scope="col" className="px-3 py-2 font-semibold">Read</th>
                <th scope="col" className="px-3 py-2 font-semibold">Next</th>
                <th scope="col" className="px-3 py-2 font-semibold">Write</th>
                <th scope="col" className="px-3 py-2 font-semibold">Move</th>
                <th scope="col" className="rounded-r-lg px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {machine.transitions
                .filter(
                  (r) =>
                    !selectedStateId ||
                    r.from === selectedStateId ||
                    r.to === selectedStateId,
                )
                .map((rule) => {
                  const wasJustFired = currentStep.appliedRule?.id === rule.id;
                  const isNextToFire = nextRule?.id === rule.id;
                  return (
                    <tr
                      key={rule.id}
                      onClick={() =>
                        onSelectState(selectedStateId === rule.from ? null : rule.from)
                      }
                      className="cursor-pointer transition-colors"
                      style={{
                        backgroundColor: wasJustFired
                          ? 'var(--accent-soft)'
                          : isNextToFire
                            ? 'var(--halt-soft)'
                            : 'transparent',
                      }}
                    >
                      <th
                        scope="row"
                        className="border-b px-3 py-2 font-semibold"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        {rule.from}
                      </th>
                      <td
                        data-label="Read"
                        className="border-b px-3 py-2 font-medium"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {rule.read}
                      </td>
                      <td
                        data-label="Next"
                        className="border-b px-3 py-2 font-semibold"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {rule.to}
                      </td>
                      <td
                        data-label="Write"
                        className="border-b px-3 py-2 font-medium"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {rule.write}
                      </td>
                      <td
                        data-label="Move"
                        className="border-b px-3 py-2 font-semibold"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {rule.move}
                      </td>
                      <td
                        data-label="Status"
                        className="border-b px-3 py-2 text-[11px] font-semibold"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {wasJustFired ? (
                          <span style={{ color: 'var(--accent)' }}>Applied</span>
                        ) : isNextToFire ? (
                          <span style={{ color: 'var(--halt)' }}>Next</span>
                        ) : (
                          <span style={{ color: 'var(--ink-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'about' && (
        <div className="custom-scroll flex-1 space-y-4 overflow-auto p-4 text-sm">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
              {machine.name}
            </h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {machine.description}
            </p>
          </div>

          <div
            className="rounded-xl border p-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ink-muted)' }}
            >
              How It Works
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {machine.algorithmSummary}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                States (Q · {machine.states.length})
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {machine.states.slice(0, 18).map((s) => (
                  <span
                    key={s.id}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {s.id}
                  </span>
                ))}
                {machine.states.length > 18 && (
                  <span className="text-[11px] font-medium tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                    +{machine.states.length - 18} more
                  </span>
                )}
              </div>
            </div>

            <div
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                Alphabets & Convention
              </div>
              <dl className="mt-1.5 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt style={{ color: 'var(--ink-muted)' }}>Input Σ:</dt>
                  <dd className="font-medium">
                    {`{ ${machine.inputAlphabet.join(', ') || 'ε'} }`}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt style={{ color: 'var(--ink-muted)' }}>Tape Γ:</dt>
                  <dd className="font-medium">{`{ ${machine.tapeAlphabet.join(', ')} }`}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt style={{ color: 'var(--ink-muted)' }}>Start / Halt:</dt>
                  <dd className="font-medium">
                    {machine.startState} / {machine.haltStates.join(', ')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt style={{ color: 'var(--ink-muted)' }}>I/O Head:</dt>
                  <dd className="font-medium">
                    {machine.initialHead === 'leading-blank' ? '[#]w#' : '#w[#]'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div>
            <div
              className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ink-muted)' }}
            >
              Verified Test Cases
            </div>
            <div className="space-y-1.5">
              {machine.sampleInputs.map((s) => (
                <button
                  key={`${s.label}-${s.input}`}
                  type="button"
                  onClick={() => onApplySample(s.input)}
                  className="pressable flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs hover:border-[var(--accent)]"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>
                    {s.label}
                  </span>
                  <span className="font-medium tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                    {s.input} →{' '}
                    <strong
                      style={{
                        color:
                          s.expectedOutput === '#Ⓨ#'
                            ? 'var(--accept)'
                            : s.expectedOutput === '#Ⓝ#'
                              ? 'var(--reject)'
                              : 'var(--accent)',
                      }}
                    >
                      {s.expectedOutput}
                    </strong>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
