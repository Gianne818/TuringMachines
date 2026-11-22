import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FilePlus2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { parseFromDSL, serializeToDSL } from '../engine/dsl';
import { autoLayoutStates } from '../engine/layout';
import type {
  Direction,
  MachineKind,
  StateNode,
  TransitionRule,
  TuringMachineDefinition,
} from '../engine/types';
import { attachDialogLightDismiss, closeDialogWithFallback } from '../utils/dialogHelpers';

interface MachineEditorDialogProps {
  open: boolean;
  machine: TuringMachineDefinition;
  onClose: () => void;
  onApply: (updated: TuringMachineDefinition) => void;
}

type EditorTab = 'table' | 'dsl';

function createBlankMachineTemplate(): TuringMachineDefinition {
  return {
    id: `custom-${Date.now()}`,
    name: 'Custom Turing Machine',
    category: 'classic-tm',
    kind: 'transducer',
    description: 'User-defined custom single-tape Turing Machine.',
    algorithmSummary: 'Custom transition rules defined in Turing Studio.',
    inputFormat: '#w# (head starts at trailing #)',
    blankSymbol: '#',
    inputAlphabet: ['0', '1', 'I', 'a', 'b'],
    tapeAlphabet: ['#', '0', '1', 'I', 'a', 'b', 'Ⓨ', 'Ⓝ'],
    initialHead: 'trailing-blank',
    startState: 'q0',
    haltStates: ['qH'],
    states: [
      { id: 'q0', label: 'Start', x: 140, y: 180, isStart: true },
      { id: 'q1', label: 'Scan', x: 340, y: 180 },
      { id: 'qH', label: 'Halt', x: 540, y: 180, isHalt: true },
    ],
    transitions: [
      { id: 'c1', from: 'q0', read: '#', to: 'q1', write: '#', move: 'L' },
      { id: 'c2', from: 'q1', read: 'I', to: 'q1', write: 'I', move: 'L' },
      { id: 'c3', from: 'q1', read: '#', to: 'qH', write: '#', move: 'R' },
    ],
    sampleInputs: [{ label: 'Sample', input: '#III#', expectedOutput: '#III#' }],
    isCustom: true,
  };
}

export function MachineEditorDialog({
  open,
  machine,
  onClose,
  onApply,
}: MachineEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<EditorTab>('table');
  const [name, setName] = useState(machine.name);
  const [kind, setKind] = useState<MachineKind>(machine.kind);
  const [startState, setStartState] = useState(machine.startState);
  const [haltInput, setHaltInput] = useState(machine.haltStates.join(', '));
  const [rules, setRules] = useState<TransitionRule[]>(machine.transitions);
  const [dslText, setDslText] = useState(() => serializeToDSL(machine));
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(machine.name);
      setKind(machine.kind);
      setStartState(machine.startState);
      setHaltInput(machine.haltStates.join(', '));
      setRules(machine.transitions.map((r) => ({ ...r })));
      setDslText(serializeToDSL(machine));
      setErrorBanner(null);
    }
  }, [open, machine]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeDialogWithFallback(dialog);
    }
  }, [open]);

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

  const buildCurrentMachineFromTable = (): TuringMachineDefinition | null => {
    const cleanStart = startState.trim();
    if (!cleanStart) {
      setErrorBanner('Start state is required.');
      return null;
    }

    const halts = haltInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Validate deterministic rules
    const seen = new Set<string>();
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      if (!r.from.trim() || !r.to.trim() || r.read.length !== 1 || r.write.length !== 1) {
        setErrorBanner(
          `Rule row ${i + 1}: state names must be non-empty and Read/Write symbols must be 1 character.`,
        );
        return null;
      }
      const key = `${r.from.trim()}\0${r.read}`;
      if (seen.has(key)) {
        setErrorBanner(
          `Duplicate deterministic rule for (${r.from.trim()}, ${r.read}) in row ${i + 1}.`,
        );
        return null;
      }
      seen.add(key);
    }

    const normalizedRules: TransitionRule[] = rules.map((r, idx) => ({
      id: r.id || `rule_${idx}`,
      from: r.from.trim(),
      read: r.read,
      to: r.to.trim(),
      write: r.write,
      move: r.move,
    }));

    const stateSet = new Set<string>([cleanStart, ...halts]);
    for (const r of normalizedRules) {
      stateSet.add(r.from);
      stateSet.add(r.to);
    }

    const prevMap = new Map(machine.states.map((s) => [s.id, s]));
    const haltSet = new Set(halts);

    let states: StateNode[] = Array.from(stateSet).map((id) => {
      const prev = prevMap.get(id);
      return {
        id,
        label: prev?.label,
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        isStart: id === cleanStart,
        isHalt: haltSet.has(id),
      };
    });

    const addedNewState = states.some((s) => !prevMap.has(s.id));
    if (addedNewState) {
      states = autoLayoutStates(states, normalizedRules, cleanStart);
    }

    const tapeSet = new Set<string>([machine.blankSymbol, ...machine.inputAlphabet]);
    for (const r of normalizedRules) {
      tapeSet.add(r.read);
      tapeSet.add(r.write);
    }

    return {
      ...machine,
      name: name.trim() || machine.name,
      kind,
      startState: cleanStart,
      haltStates: halts,
      states,
      transitions: normalizedRules,
      tapeAlphabet: Array.from(tapeSet),
      schemaDiagram: undefined,
      isCustom: true,
    };
  };

  const handleSwitchTab = (nextTab: EditorTab) => {
    setErrorBanner(null);
    if (nextTab === 'dsl' && tab === 'table') {
      const built = buildCurrentMachineFromTable();
      if (built) {
        setDslText(serializeToDSL(built));
        setTab('dsl');
      }
    } else if (nextTab === 'table' && tab === 'dsl') {
      const parsed = parseFromDSL(dslText, machine);
      if (!parsed.ok) {
        setErrorBanner(`Line ${parsed.errors[0].line}: ${parsed.errors[0].message}`);
        return;
      }
      setStartState(parsed.startState);
      setHaltInput(parsed.haltStates.join(', '));
      setRules(parsed.transitions);
      setTab('table');
    }
  };

  const handleApply = () => {
    setErrorBanner(null);
    if (tab === 'dsl') {
      const parsed = parseFromDSL(dslText, machine);
      if (!parsed.ok) {
        setErrorBanner(
          parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join(' · '),
        );
        return;
      }
      onApply({
        ...machine,
        name: name.trim() || machine.name,
        kind,
        startState: parsed.startState,
        haltStates: parsed.haltStates,
        states: parsed.states,
        transitions: parsed.transitions,
        tapeAlphabet: parsed.tapeAlphabet,
        schemaDiagram: undefined,
        isCustom: true,
      });
      requestClose();
      return;
    }

    const built = buildCurrentMachineFromTable();
    if (!built) return;
    onApply(built);
    requestClose();
  };

  const handleNewBlank = () => {
    const blank = createBlankMachineTemplate();
    setName(blank.name);
    setKind(blank.kind);
    setStartState(blank.startState);
    setHaltInput(blank.haltStates.join(', '));
    setRules(blank.transitions);
    setDslText(serializeToDSL(blank));
    setErrorBanner(null);
  };

  const handleExportJson = () => {
    const built = tab === 'table' ? buildCurrentMachineFromTable() : machine;
    if (!built) return;
    const blob = new Blob([JSON.stringify(built, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${built.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as TuringMachineDefinition;
      if (!parsed.startState || !Array.isArray(parsed.transitions) || !Array.isArray(parsed.states)) {
        setErrorBanner('Invalid Turing Machine JSON format.');
        return;
      }
      onApply({ ...parsed, isCustom: true });
      requestClose();
    } catch {
      setErrorBanner('Could not parse JSON file.');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="editor-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
      className="w-[min(860px,calc(100vw-2rem))] rounded-3xl p-0 shadow-2xl"
    >
      <div className="flex max-h-[88dvh] flex-col">
        {/* Header */}
        <header
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2
              id="editor-dialog-title"
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--ink-primary)' }}
            >
              Machine & Transition Editor
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Edit transition rules visually or with text DSL (`state, read -&gt; next, write, L|R|S`).
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="pressable rounded-xl border p-2"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--ink-secondary)',
            }}
            aria-label="Close machine editor"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Metadata Controls */}
        <div
          className="grid grid-cols-1 gap-3 border-b px-5 py-3.5 sm:grid-cols-4"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)',
          }}
        >
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
              Machine Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-xl border px-3 text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
              Mode
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MachineKind)}
              className="h-9 rounded-xl border px-2.5 text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            >
              <option value="transducer">Transducer (#output#)</option>
              <option value="decider">Decider (#Ⓨ# / #Ⓝ#)</option>
              <option value="builtin">Built-in Function</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
                Start
              </span>
              <input
                type="text"
                value={startState}
                onChange={(e) => setStartState(e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-9 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>
                Halt(s)
              </span>
              <input
                type="text"
                value={haltInput}
                onChange={(e) => setHaltInput(e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-9 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </label>
          </div>
        </div>

        {/* Mode Switch & Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="flex items-center rounded-xl border p-0.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => handleSwitchTab('table')}
              className="pressable rounded-lg px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: tab === 'table' ? 'var(--bg-surface)' : 'transparent',
                color: tab === 'table' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              }}
            >
              Transition Table ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('dsl')}
              className="pressable rounded-lg px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: tab === 'dsl' ? 'var(--bg-surface)' : 'transparent',
                color: tab === 'dsl' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              }}
            >
              Text Rule DSL
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleNewBlank}
              className="pressable flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--ink-secondary)',
              }}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>Blank Machine</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pressable flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--ink-secondary)',
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="pressable flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--ink-secondary)',
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJson}
              className="hidden"
            />
          </div>
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div
            className="mx-5 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{
              backgroundColor: 'var(--reject-soft)',
              borderColor: 'var(--reject)',
              color: 'var(--reject)',
            }}
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Editor Body */}
        <div className="custom-scroll flex-1 overflow-y-auto p-5">
          {tab === 'table' ? (
            <div className="space-y-2">
              <div
                className="grid grid-cols-[1fr_72px_1fr_72px_84px_40px] gap-2 px-1 text-[11px] font-semibold"
                style={{ color: 'var(--ink-muted)' }}
              >
                <span>State</span>
                <span>Read</span>
                <span>Next State</span>
                <span>Write</span>
                <span>Move</span>
                <span className="sr-only">Delete</span>
              </div>

              {rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="grid grid-cols-[1fr_72px_1fr_72px_84px_40px] items-center gap-2"
                >
                  <input
                    type="text"
                    value={rule.from}
                    onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, from: e.target.value };
                      setRules(next);
                    }}
                    aria-label={`Rule ${idx + 1} current state`}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-8 rounded-lg border px-2 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  />
                  <input
                    type="text"
                    maxLength={1}
                    value={rule.read}
                    onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, read: e.target.value };
                      setRules(next);
                    }}
                    aria-label={`Rule ${idx + 1} read symbol`}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-8 rounded-lg border px-2 py-1 text-center text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  />
                  <input
                    type="text"
                    value={rule.to}
                    onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, to: e.target.value };
                      setRules(next);
                    }}
                    aria-label={`Rule ${idx + 1} next state`}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-8 rounded-lg border px-2 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  />
                  <input
                    type="text"
                    maxLength={1}
                    value={rule.write}
                    onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, write: e.target.value };
                      setRules(next);
                    }}
                    aria-label={`Rule ${idx + 1} write symbol`}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-h-8 rounded-lg border px-2 py-1 text-center text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  />
                  <select
                    value={rule.move}
                    onChange={(e) => {
                      const next = [...rules];
                      next[idx] = { ...rule, move: e.target.value as Direction };
                      setRules(next);
                    }}
                    aria-label={`Rule ${idx + 1} head move`}
                    className="min-h-8 rounded-lg border px-2 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <option value="L">L</option>
                    <option value="R">R</option>
                    <option value="S">S</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setRules(rules.filter((_, i) => i !== idx))}
                    className="pressable flex h-8 w-8 items-center justify-center rounded-lg border hover:text-[var(--reject)]"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--ink-muted)',
                    }}
                    aria-label={`Delete rule ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setRules([
                    ...rules,
                    {
                      id: `r_${Date.now()}`,
                      from: startState || 'q0',
                      read: '#',
                      to: haltInput.split(',')[0]?.trim() || 'qH',
                      write: '#',
                      move: 'S',
                    },
                  ])
                }
                className="pressable mt-2 flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs font-medium"
                style={{
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Transition Rule</span>
              </button>
            </div>
          ) : (
            <textarea
              value={dslText}
              onChange={(e) => setDslText(e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Turing Machine transition rules DSL"
              className="h-80 w-full rounded-2xl border p-3.5 text-xs font-medium leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
          )}
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-end gap-2 border-t px-5 py-3.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={requestClose}
            className="pressable h-9 rounded-xl border px-4 text-xs font-semibold"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--ink-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="pressable h-9 rounded-xl px-4 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Apply Machine
          </button>
        </footer>
      </div>
    </dialog>
  );
}
