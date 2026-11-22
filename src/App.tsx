import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuiltInFunctionsDialog } from './components/BuiltInFunctionsDialog';
import { LanguageComposer } from './components/LanguageComposer';
import { MachineEditorDialog } from './components/MachineEditorDialog';
import { StateDiagram } from './components/StateDiagram';
import { type PlaybackSpeed, TapeStage } from './components/TapeStage';
import { TopBar, type ViewMode } from './components/TopBar';
import { TracePanel } from './components/TracePanel';
import { compileLanguageSpec, DEFAULT_SPECS, type LanguageSpec } from './compilers';
import { runSimulation } from './engine/simulator';
import type { BuiltInId, TuringMachineDefinition } from './engine/types';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';

const SPEED_MS: Record<PlaybackSpeed, number> = {
  0.5: 900,
  1: 480,
  3: 170,
  10: 55,
  25: 20,
};

function getInitialMachine(): {
  spec: LanguageSpec;
  machine: TuringMachineDefinition;
  sample: string;
} {
  const initialSpec = DEFAULT_SPECS.regular;
  const res = compileLanguageSpec(initialSpec);
  if (!res.ok) {
    throw new Error(`Failed to compile initial default spec: ${res.error}`);
  }
  return {
    spec: initialSpec,
    machine: res.machine,
    sample: res.machine.sampleInputs[0]?.input ?? '#aabb#',
  };
}

export function App() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const initial = useMemo(() => getInitialMachine(), []);

  const [spec, setSpec] = useState<LanguageSpec>(initial.spec);
  const [activeMachine, setActiveMachine] = useState<TuringMachineDefinition>(initial.machine);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileNotes, setCompileNotes] = useState<string | undefined>(undefined);
  const [compileWarning, setCompileWarning] = useState<string | undefined>(undefined);
  const lastNonCustomSpecRef = useRef<LanguageSpec>(initial.spec);

  const [activeInput, setActiveInput] = useState<string>(initial.sample);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);

  const [builtInsOpen, setBuiltInsOpen] = useState<boolean>(false);
  const [focusedBuiltInId, setFocusedBuiltInId] = useState<BuiltInId | null>(null);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);

  const trace = useMemo(
    () => runSimulation(activeMachine, activeInput),
    [activeMachine, activeInput],
  );

  const clampedStepIndex = Math.min(currentStepIndex, trace.totalSteps);
  const currentStep = trace.steps[clampedStepIndex] ?? trace.steps[0];

  // Auto-advance playback timer
  useEffect(() => {
    if (!isPlaying) return;
    if (clampedStepIndex >= trace.totalSteps) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= trace.totalSteps) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        if (next >= trace.totalSteps) {
          setIsPlaying(false);
        }
        return next;
      });
    }, SPEED_MS[speed]);

    return () => window.clearInterval(timer);
  }, [isPlaying, speed, trace.totalSteps, clampedStepIndex]);

  const handleChangeSpec = useCallback(
    (nextSpec: LanguageSpec, preferredSampleInput?: string) => {
      setIsPlaying(false);
      setSpec(nextSpec);
      if (!(nextSpec.kind === 'direct-tm' && nextSpec.mode === 'custom')) {
        lastNonCustomSpecRef.current = nextSpec;
      }

      const result = compileLanguageSpec(nextSpec);
      if (result.ok) {
        setActiveMachine(result.machine);
        setCompileError(null);
        setCompileNotes(result.notes);
        setCompileWarning(result.warning);
        setSelectedStateId(null);
        setCurrentStepIndex(0);
        if (preferredSampleInput !== undefined) {
          setActiveInput(preferredSampleInput);
        }
      } else {
        setCompileError(result.error);
        setCompileNotes(undefined);
        setCompileWarning(undefined);
      }
    },
    [],
  );

  const handleLoadBuiltInMachine = useCallback((machine: TuringMachineDefinition) => {
    setIsPlaying(false);
    setSelectedStateId(null);
    setCompileError(null);
    setCompileNotes('Lewis & Papadimitriou built-in primitive');
    setCompileWarning(undefined);
    setActiveMachine(machine);
    setSpec({
      kind: 'direct-tm',
      mode: 'custom',
      pipeline: [
        { id: 'step-1', op: 'C' },
        { id: 'step-2', op: 'S_L' },
      ],
      symbols: 'a,b,c',
      customMachine: machine,
    });
    setActiveInput(machine.sampleInputs[0]?.input ?? '#abc#');
    setCurrentStepIndex(0);
  }, []);

  const handleApplyInput = useCallback((nextInput: string) => {
    setIsPlaying(false);
    setActiveInput(nextInput);
    setCurrentStepIndex(0);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (clampedStepIndex >= trace.totalSteps) {
      setCurrentStepIndex(0);
    }
    if (trace.totalSteps > 0) {
      setIsPlaying(true);
    }
  }, [isPlaying, clampedStepIndex, trace.totalSteps]);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(trace.totalSteps, prev + 1));
  }, [trace.totalSteps]);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  }, []);

  const handleJumpEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(trace.totalSteps);
  }, [trace.totalSteps]);

  const handleScrub = useCallback(
    (step: number) => {
      setIsPlaying(false);
      setCurrentStepIndex(Math.max(0, Math.min(trace.totalSteps, step)));
    },
    [trace.totalSteps],
  );

  const handleInspectBuiltIn = useCallback((id: BuiltInId) => {
    setFocusedBuiltInId(id);
    setBuiltInsOpen(true);
  }, []);

  const handleApplyEditedMachine = useCallback((updated: TuringMachineDefinition) => {
    setIsPlaying(false);
    setSelectedStateId(null);
    setCompileError(null);
    setCompileNotes('Custom transition table');
    setCompileWarning(undefined);
    setActiveMachine(updated);
    setSpec({
      kind: 'direct-tm',
      mode: 'custom',
      pipeline: [
        { id: 'step-1', op: 'C' },
        { id: 'step-2', op: 'S_L' },
      ],
      symbols: 'a,b,c',
      customMachine: updated,
    });
    setCurrentStepIndex(0);
  }, []);

  const handleRestoreOriginal = useCallback(() => {
    const restoreSpec = lastNonCustomSpecRef.current;
    const res = compileLanguageSpec(restoreSpec);
    if (res.ok) {
      handleChangeSpec(restoreSpec, res.machine.sampleInputs[0]?.input ?? '#');
    }
  }, [handleChangeSpec]);

  const shortcutHandlers = useMemo(
    () => ({
      onTogglePlay: handleTogglePlay,
      onStepForward: handleStepForward,
      onStepBack: handleStepBack,
      onReset: handleReset,
      onViewMode: setViewMode,
      onOpenBuiltIns: () => {
        setFocusedBuiltInId(null);
        setBuiltInsOpen((v) => !v);
      },
    }),
    [handleTogglePlay, handleStepForward, handleStepBack, handleReset],
  );
  useKeyboardShortcuts(shortcutHandlers);

  const isCustomOverride = Boolean(activeMachine.isCustom);

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <TopBar
        activeMachine={activeMachine}
        viewMode={viewMode}
        resolvedTheme={resolvedTheme}
        onChangeViewMode={setViewMode}
        onOpenBuiltIns={() => {
          setFocusedBuiltInId(null);
          setBuiltInsOpen(true);
        }}
        onOpenEditor={() => setEditorOpen(true)}
        onResetCustom={isCustomOverride ? handleRestoreOriginal : undefined}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-3.5 p-3 sm:p-5">
        <LanguageComposer
          spec={spec}
          onChangeSpec={handleChangeSpec}
          activeMachine={activeMachine}
          compileError={compileError}
          compileNotes={compileNotes}
          compileWarning={compileWarning}
          onOpenEditor={() => setEditorOpen(true)}
          onOpenBuiltIns={() => {
            setFocusedBuiltInId(null);
            setBuiltInsOpen(true);
          }}
        />

        <TapeStage
          machine={activeMachine}
          inputValue={activeInput}
          onApplyInput={handleApplyInput}
          trace={trace}
          currentStepIndex={clampedStepIndex}
          currentStep={currentStep}
          isPlaying={isPlaying}
          speed={speed}
          onTogglePlay={handleTogglePlay}
          onStepForward={handleStepForward}
          onStepBack={handleStepBack}
          onReset={handleReset}
          onJumpEnd={handleJumpEnd}
          onScrub={handleScrub}
          onChangeSpeed={setSpeed}
        />

        <div
          className={`grid gap-3.5 ${
            viewMode === 'split'
              ? 'grid-cols-1 xl:grid-cols-[1.2fr_1fr]'
              : 'grid-cols-1'
          }`}
        >
          {(viewMode === 'split' || viewMode === 'diagram') && (
            <div className="h-[460px] sm:h-[520px]">
              <StateDiagram
                machine={activeMachine}
                currentStep={currentStep}
                status={trace.status}
                selectedStateId={selectedStateId}
                onSelectState={setSelectedStateId}
                onInspectBuiltIn={handleInspectBuiltIn}
              />
            </div>
          )}

          {(viewMode === 'split' || viewMode === 'trace') && (
            <div className="h-[440px] sm:h-[520px]">
              <TracePanel
                machine={activeMachine}
                trace={trace}
                currentStepIndex={clampedStepIndex}
                currentStep={currentStep}
                selectedStateId={selectedStateId}
                onSelectStep={handleScrub}
                onSelectState={setSelectedStateId}
                onApplySample={handleApplyInput}
              />
            </div>
          )}
        </div>
      </main>

      <BuiltInFunctionsDialog
        open={builtInsOpen}
        focusedId={focusedBuiltInId}
        onClose={() => setBuiltInsOpen(false)}
        onLoadMachine={handleLoadBuiltInMachine}
      />

      <MachineEditorDialog
        open={editorOpen}
        machine={activeMachine}
        onClose={() => setEditorOpen(false)}
        onApply={handleApplyEditedMachine}
      />
    </div>
  );
}
export default App;
