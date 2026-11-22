import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize2, Minus, Plus } from 'lucide-react';
import { deriveLpSchemaFromTm } from '../engine/schemaFromTm';
import type {
  BuiltInId,
  ExecutionStep,
  SimulationStatus,
  TuringMachineDefinition,
} from '../engine/types';
import {
  computeSchemaBounds,
  renderLpHtmlLabel,
  resolveStepActionLabel,
  SchemaDiagramCanvas,
} from './SchemaDiagramCanvas';

interface StateDiagramProps {
  machine: TuringMachineDefinition;
  currentStep: ExecutionStep;
  status: SimulationStatus;
  selectedStateId: string | null;
  onSelectState: (stateId: string | null) => void;
  onInspectBuiltIn: (id: BuiltInId) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.4;

export function StateDiagram({
  machine,
  currentStep,
  status,
  selectedStateId: _selectedStateId,
  onSelectState: _onSelectState,
  onInspectBuiltIn,
}: StateDiagramProps) {
  const schema = useMemo(
    () => machine.schemaDiagram ?? deriveLpSchemaFromTm(machine),
    [machine],
  );

  const activeNodeId = useMemo(() => {
    if (
      currentStep.activeSchemaNodeId &&
      schema.nodes.some((n) => n.id === currentStep.activeSchemaNodeId)
    ) {
      return currentStep.activeSchemaNodeId;
    }
    return schema.nodes.find((n) => n.id === currentStep.state)?.id;
  }, [currentStep.activeSchemaNodeId, currentStep.state, schema.nodes]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const transformRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  transformRef.current = { zoom, pan };

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    const bounds = computeSchemaBounds(schema);
    const rect = el?.getBoundingClientRect();
    const vw = rect?.width && rect.width > 0 ? rect.width : 760;
    const vh = rect?.height && rect.height > 0 ? rect.height : 460;

    const usableW = Math.max(200, vw - 36);
    const usableH = Math.max(160, vh - 80);
    const nextZoom = Math.min(
      1.45,
      Math.max(MIN_ZOOM, Math.min(usableW / bounds.width, usableH / bounds.height)),
    );
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    setZoom(nextZoom);
    setPan({
      x: vw / 2 - cx * nextZoom,
      y: vh / 2 + 6 - cy * nextZoom,
    });
  }, [schema]);

  // Fit diagram whenever machine/schema changes or container resizes
  useEffect(() => {
    const el = containerRef.current;
    const raf = requestAnimationFrame(() => fitView());
    if (!el) return () => cancelAnimationFrame(raf);

    const observer = new ResizeObserver(() => {
      fitView();
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [fitView]);

  const zoomAroundClientPoint = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) {
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
        return;
      }

      const { zoom: curZoom, pan: curPan } = transformRef.current;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, curZoom * factor));
      const focalX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const focalY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      const worldX = (focalX - curPan.x) / curZoom;
      const worldY = (focalY - curPan.y) / curZoom;

      setZoom(nextZoom);
      setPan({
        x: focalX - worldX * nextZoom,
        y: focalY - worldY * nextZoom,
      });
    },
    [],
  );

  // Non-passive wheel zoom so page scroll does not hijack diagram zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.09 : 0.92;
      zoomAroundClientPoint(factor, e.clientX, e.clientY);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoomAroundClientPoint]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;

    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    if (d.moved) {
      setPan({ x: d.startPanX + dx, y: d.startPanY + dy });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    if (d.moved && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setIsPanning(false);
  };

  const activeOpLabel = resolveStepActionLabel(machine, currentStep, schema.nodes);
  const isAtHalt = machine.haltStates.includes(currentStep.state);
  const dotColor = isAtHalt
    ? status === 'accepted'
      ? 'var(--accept)'
      : status === 'rejected'
        ? 'var(--reject)'
        : 'var(--halt)'
    : 'var(--accent)';

  const breadcrumbTokens =
    currentStep.macroPath && currentStep.macroPath.length > 0
      ? currentStep.macroPath
      : [activeOpLabel];

  return (
    <section
      className="diagram-grid relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: 'var(--border-subtle)' }}
      aria-label="Lewis & Papadimitriou Machine Schema Diagram"
    >
      {/* Top Floating Chrome: Active Execution Breadcrumb & Pan/Zoom Toolbar */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          className="glass-chrome pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--ink-primary)',
          }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          <span className="flex flex-wrap items-center gap-1">
            {breadcrumbTokens.map((token, idx) => (
              <Fragment key={`${token}-${idx}`}>
                {idx > 0 && (
                  <span style={{ color: 'var(--ink-muted)' }} aria-hidden="true">
                    ›
                  </span>
                )}
                <span>{renderLpHtmlLabel(token)}</span>
              </Fragment>
            ))}
          </span>
        </div>

        <div
          className="glass-chrome pointer-events-auto flex items-center gap-0.5 rounded-xl border p-1 shadow-sm"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="group"
          aria-label="Diagram zoom controls"
        >
          <button
            type="button"
            onClick={() => zoomAroundClientPoint(1.18)}
            className="pressable flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--ink-primary)' }}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomAroundClientPoint(0.85)}
            className="pressable flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--ink-primary)' }}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={fitView}
            className="pressable flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--ink-secondary)' }}
            aria-label="Fit diagram to view"
            title="Fit to view"
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span>Fit</span>
          </button>
        </div>
      </div>

      {/* Interactive Pan/Zoom L&P Diagram Surface */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative h-full w-full flex-1 touch-none select-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <SchemaDiagramCanvas
          schema={schema}
          activeNodeId={activeNodeId}
          status={status}
          viewportTransform={{ x: pan.x, y: pan.y, scale: zoom }}
          onInspectBuiltIn={onInspectBuiltIn}
        />
      </div>

      {/* Subtle Bottom Helper Hints */}
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 z-10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div
          className="flex items-center gap-1.5 rounded-lg px-2 py-0.5"
          style={{ color: 'var(--ink-muted)' }}
        >
          <LocateFixed className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Drag background to pan · Scroll to zoom</span>
        </div>

        <div
          className="hidden rounded-lg px-2 py-0.5 sm:block"
          style={{ color: 'var(--ink-muted)' }}
        >
          Click {renderLpHtmlLabel('L_#')}, {renderLpHtmlLabel('R_#')},{' '}
          {renderLpHtmlLabel('S_L')}, {renderLpHtmlLabel('S_R')}, C, or E blocks to view built-in diagrams
        </div>
      </div>
    </section>
  );
}
