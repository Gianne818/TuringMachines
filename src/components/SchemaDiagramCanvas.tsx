import { Fragment, type ReactNode, useId } from 'react';
import { deriveLpSchemaFromTm } from '../engine/schemaFromTm';
import type {
  BuiltInId,
  ExecutionStep,
  SchemaDiagram,
  SchemaEdge,
  SchemaNode,
  SimulationStatus,
  TuringMachineDefinition,
} from '../engine/types';

export interface SchemaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

interface SchemaDiagramCanvasProps {
  schema: SchemaDiagram;
  activeNodeId?: string;
  status?: SimulationStatus;
  compact?: boolean;
  viewportTransform?: ViewportTransform;
  onInspectBuiltIn?: (id: BuiltInId) => void;
}

export interface LpTokenSegment {
  text: string;
  isSub: boolean;
}

const NODE_FONT_SIZE = 16.5;
const SUBLABEL_FONT_SIZE = 10;
const EDGE_FONT_SIZE = 12.5;

const UNICODE_SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
  '+': '₊',
  '-': '₋',
  '=': '₌',
};

/** Strip leading entry `>` markers from an L&P node label. */
export function stripStartChevron(label: string): string {
  return label.replace(/^>\s*/, '').trim();
}

const derivedNodesCache = new WeakMap<TuringMachineDefinition, SchemaNode[]>();

function getMachineSchemaNodes(machine: TuringMachineDefinition): SchemaNode[] {
  if (machine.schemaDiagram?.nodes) {
    return machine.schemaDiagram.nodes;
  }
  const cached = derivedNodesCache.get(machine);
  if (cached) return cached;
  const derived = deriveLpSchemaFromTm(machine).nodes;
  derivedNodesCache.set(machine, derived);
  return derived;
}

/**
 * Resolve the cleanest human-readable Lewis & Papadimitriou operation label for
 * an execution step, falling back to `step.state` only when no schema node matches.
 */
export function resolveStepActionLabel(
  machine: TuringMachineDefinition,
  step: ExecutionStep,
  fallbackNodes?: SchemaNode[],
): string {
  const nodes = fallbackNodes ?? getMachineSchemaNodes(machine);
  if (nodes.length > 0) {
    if (step.activeSchemaNodeId) {
      const byId = nodes.find((n) => n.id === step.activeSchemaNodeId);
      if (byId) {
        return stripStartChevron(byId.label);
      }
    }
    const byState = nodes.find((n) => n.id === step.state);
    if (byState) {
      return stripStartChevron(byState.label);
    }
  }
  return step.state;
}

/**
 * Parse `_<subtoken>` and `_{<subtoken>}` sequences inside L&P labels into
 * main/subscript segments. Skips internal multi-underscore identifiers like `q_dfa_2`.
 */
export function parseLpSubscripts(raw: string): LpTokenSegment[] {
  if (!raw) return [{ text: '', isSub: false }];

  // Preserve fallback primitive state identifiers like `q_dfa_2` or `q_addP_sep` verbatim
  if (/^q_[a-zA-Z0-9_]+$/.test(raw) && raw.split('_').length > 2) {
    return [{ text: raw, isSub: false }];
  }

  const pattern = /_(\{([^}]+)\}|([^\s{}(),;→·]+))/g;
  const segments: LpTokenSegment[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(pattern)) {
    const matchStart = match.index ?? 0;
    if (matchStart > lastIndex) {
      segments.push({
        text: raw.slice(lastIndex, matchStart),
        isSub: false,
      });
    }
    const subText = match[2] ?? match[3] ?? '';
    if (subText.length > 0) {
      segments.push({ text: subText, isSub: true });
    }
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < raw.length) {
    segments.push({ text: raw.slice(lastIndex), isSub: false });
  }

  return segments.length > 0 ? segments : [{ text: raw, isSub: false }];
}

/** Convert an L&P label into clean plain-text Unicode (useful for Markdown/aria strings). */
export function formatLpUnicodeLabel(raw: string): string {
  return parseLpSubscripts(raw)
    .map((seg) => {
      if (!seg.isSub) return seg.text;
      let mapped = '';
      for (const ch of seg.text) {
        mapped += UNICODE_SUBSCRIPT_MAP[ch] ?? UNICODE_SUBSCRIPT_MAP[ch.toLowerCase()] ?? ch;
      }
      return mapped;
    })
    .join('');
}

/** Render an L&P label in HTML JSX with crisp typographic `<sub>` subscripts. */
export function renderLpHtmlLabel(raw: string): ReactNode {
  const segments = parseLpSubscripts(raw);
  if (segments.length === 1 && !segments[0].isSub) {
    return segments[0].text;
  }
  return segments.map((seg, idx) =>
    seg.isSub ? (
      <sub
        key={`sub-${idx}`}
        className="font-bold leading-none"
        style={{ fontSize: '0.72em', verticalAlign: '-0.2em' }}
      >
        {seg.text}
      </sub>
    ) : (
      <Fragment key={`txt-${idx}`}>{seg.text}</Fragment>
    ),
  );
}

/** Render an L&P label inside an SVG `<text>` using `<tspan baselineShift="sub">`. */
function renderLpSvgLabel(raw: string, keyPrefix: string): ReactNode {
  const segments = parseLpSubscripts(raw);
  if (segments.length === 1 && !segments[0].isSub) {
    return segments[0].text;
  }
  return segments.map((seg, idx) =>
    seg.isSub ? (
      <tspan
        key={`${keyPrefix}-sub-${idx}`}
        baselineShift="sub"
        fontSize="72%"
        fontWeight={700}
      >
        {seg.text}
      </tspan>
    ) : (
      <tspan key={`${keyPrefix}-txt-${idx}`}>{seg.text}</tspan>
    ),
  );
}

function estimateCharWidth(ch: string, fontSize: number): number {
  if (ch === ' ' || ch === '·') return fontSize * 0.34;
  if ('iIl1.,:|!'.includes(ch)) return fontSize * 0.38;
  if ('ⓎⓃMWΣΓΩ'.includes(ch)) return fontSize * 0.88;
  if ('↔→←'.includes(ch)) return fontSize * 0.8;
  if ('≠=+-<>'.includes(ch)) return fontSize * 0.65;
  return fontSize * 0.62;
}

function estimateTextWidth(raw: string, fontSize: number): number {
  const segments = parseLpSubscripts(raw);
  let width = 0;
  for (const seg of segments) {
    const segSize = seg.isSub ? fontSize * 0.72 : fontSize;
    for (const ch of seg.text) {
      width += estimateCharWidth(ch, segSize);
    }
  }
  return width;
}

interface NodeMetrics {
  cleanLabel: string;
  textW: number;
  w: number;
  h: number;
  hasSubscript: boolean;
  isStart: boolean;
}

function getNodeMetrics(node: SchemaNode): NodeMetrics {
  const isStart =
    node.kind === 'start-action' || node.label.trimStart().startsWith('>');
  const cleanLabel = stripStartChevron(node.label);
  const segments = parseLpSubscripts(cleanLabel);
  const hasSubscript = segments.some((s) => s.isSub);
  const textW = estimateTextWidth(cleanLabel, NODE_FONT_SIZE);
  const subW = node.sublabel
    ? estimateTextWidth(node.sublabel, SUBLABEL_FONT_SIZE)
    : 0;
  const contentW = Math.max(textW, subW);
  const w = Math.max(36, contentW + 20);
  const h = node.sublabel ? 44 : hasSubscript ? 34 : 30;
  return { cleanLabel, textW, w, h, hasSubscript, isStart };
}

function clipLineToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
  pad = 6,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return { x: x1, y: y1 };
  const hw = w / 2 + pad;
  const hh = h / 2 + pad;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: x1 + dx * t, y: y1 + dy * t };
}

function getAnchorPoint(
  node: SchemaNode,
  metrics: NodeMetrics,
  anchor: 'top' | 'bottom' | 'left' | 'right',
  pad: number,
): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: node.x, y: node.y - metrics.h / 2 - pad };
    case 'bottom':
      return { x: node.x, y: node.y + metrics.h / 2 + pad };
    case 'left':
      return { x: node.x - metrics.w / 2 - pad, y: node.y };
    case 'right':
      return { x: node.x + metrics.w / 2 + pad, y: node.y };
  }
}

function isTopBracketEdge(edge: SchemaEdge, from: SchemaNode, to: SchemaNode): boolean {
  if (edge.from === edge.to || edge.isSelfLoop) return false;
  if (edge.fromAnchor === 'top' && edge.toAnchor === 'top' && to.x < from.x) {
    return true;
  }
  return Boolean(
    edge.curveOffset &&
      edge.curveOffset < 0 &&
      to.x < from.x &&
      Math.abs(from.y - to.y) <= 40,
  );
}

function getTopBracketGeometry(
  edge: SchemaEdge,
  from: SchemaNode,
  to: SchemaNode,
  fromMetrics: NodeMetrics,
  toMetrics: NodeMetrics,
  nodes: SchemaNode[],
  upwardSelfLoopIds: Set<string>,
  getMetrics: (node: SchemaNode) => NodeMetrics,
) {
  const startX = from.x;
  const startY = from.y - fromMetrics.h / 2 - 4;
  const endX = to.x;
  const endY = to.y - toMetrics.h / 2 - 6;
  const minTop = Math.min(startY, endY);
  const curveMag = Math.abs(edge.curveOffset ?? 64);
  const baseRise = Math.max(40, Math.min(72, curveMag * 0.78));

  // Clear any intermediate nodes (and their overhead self-loops) across the horizontal span
  const minSpanX = Math.min(from.x, to.x) - 30;
  const maxSpanX = Math.max(from.x, to.x) + 30;
  const obstacles = nodes.filter(
    (n) =>
      n.id !== from.id &&
      n.id !== to.id &&
      n.x >= minSpanX &&
      n.x <= maxSpanX,
  );
  const highestObstacleTop = obstacles.reduce((minY, n) => {
    const m = getMetrics(n);
    const overhead = upwardSelfLoopIds.has(n.id) ? 58 : 12;
    return Math.min(minY, n.y - m.h / 2 - overhead);
  }, minTop);

  const railY = Math.min(minTop - baseRise, highestObstacleTop - 22);
  const dx = Math.abs(startX - endX);
  const dy = minTop - railY;
  const r = Math.max(4, Math.min(14, dx / 2 - 2, dy - 4));
  const d = `M ${startX} ${startY} L ${startX} ${railY + r} Q ${startX} ${railY} ${startX - r} ${railY} L ${endX + r} ${railY} Q ${endX} ${railY} ${endX} ${railY + r} L ${endX} ${endY}`;

  return {
    d,
    railY,
    labelX: (startX + endX) / 2,
    labelY: railY,
  };
}

/**
 * Compute tight bounding box across all nodes, start chevrons, self-loops,
 * top bracket return paths, and curved edges so diagrams never clip.
 */
export function computeSchemaBounds(schema: SchemaDiagram): SchemaBounds {
  if (schema.nodes.length === 0) {
    const w = schema.width ?? 480;
    const h = schema.height ?? 240;
    return { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h };
  }

  const metricsMap = new Map<string, NodeMetrics>();
  const nodeMap = new Map<string, SchemaNode>();
  for (const n of schema.nodes) {
    nodeMap.set(n.id, n);
    metricsMap.set(n.id, getNodeMetrics(n));
  }

  const upwardSelfLoopIds = new Set(
    schema.edges
      .filter(
        (e) =>
          (e.isSelfLoop || e.from === e.to) &&
          Math.sin(((e.loopAngleDeg ?? -90) * Math.PI) / 180) < -0.15,
      )
      .map((e) => e.from),
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePoint = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const node of schema.nodes) {
    const m = metricsMap.get(node.id)!;
    includePoint(node.x - m.w / 2, node.y - m.h / 2);
    includePoint(node.x + m.w / 2, node.y + m.h / 2);
    if (m.isStart) {
      includePoint(node.x - m.w / 2 - 22, node.y);
    }
  }

  for (const edge of schema.edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const fromM = metricsMap.get(from.id)!;
    const toM = metricsMap.get(to.id)!;

    if (edge.isSelfLoop || edge.from === edge.to) {
      const angleDeg = edge.loopAngleDeg ?? -90;
      if (Math.abs(angleDeg + 90) <= 25) {
        const labelPad = edge.label ? estimateTextWidth(edge.label, EDGE_FONT_SIZE) / 2 + 8 : 26;
        includePoint(from.x - Math.max(26, labelPad), from.y - fromM.h / 2 - 58);
        includePoint(from.x + Math.max(26, labelPad), from.y - fromM.h / 2 - 58);
      } else {
        const rad = (angleDeg * Math.PI) / 180;
        const reach = Math.max(fromM.w, fromM.h) / 2 + 56;
        includePoint(from.x + Math.cos(rad) * reach, from.y + Math.sin(rad) * reach);
      }
      continue;
    }

    if (isTopBracketEdge(edge, from, to)) {
      const g = getTopBracketGeometry(
        edge,
        from,
        to,
        fromM,
        toM,
        schema.nodes,
        upwardSelfLoopIds,
        getNodeMetrics,
      );
      includePoint(g.labelX, g.railY - 18);
      continue;
    }

    const curve = edge.curveOffset ?? 0;
    if (curve !== 0) {
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      if (Math.abs(from.y - to.y) <= 24) {
        const ctrlY =
          curve < 0
            ? Math.min(from.y - fromM.h / 2, to.y - toM.h / 2) + curve * 0.85
            : Math.max(from.y + fromM.h / 2, to.y + toM.h / 2) + curve * 0.85;
        includePoint(midX, 0.5 * midY + 0.5 * ctrlY + (curve < 0 ? -16 : 16));
      } else {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;
        includePoint(midX + nx * curve * 0.65, midY + ny * curve * 0.65);
      }
    }
  }

  // Outer breathing room ensuring zero clipping of glyphs, arrowheads, or halos
  minX -= 42;
  minY -= 38;
  maxX += 42;
  maxY += 34;

  // Enforce comfortable minimum span so 2-node diagrams remain well proportioned
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  if (rawW < 280) {
    const extra = (280 - rawW) / 2;
    minX -= extra;
    maxX += extra;
  }
  if (rawH < 150) {
    const extra = (150 - rawH) / 2;
    minY -= extra;
    maxY += extra;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getNodePalette(node: SchemaNode, cleanLabel: string, isActive: boolean, status?: SimulationStatus, hasBuiltInHandler?: boolean) {
  const isAccept =
    node.variant === 'accept' ||
    cleanLabel.includes('Ⓨ') ||
    (node.kind === 'halt' && isActive && status === 'accepted');
  const isReject =
    node.variant === 'reject' ||
    cleanLabel.includes('Ⓝ') ||
    (node.kind === 'halt' && isActive && status === 'rejected');

  if (isAccept) {
    return {
      textColor: 'var(--accept)',
      pillFill: 'var(--accept-soft)',
      pillStroke: 'var(--accept)',
    };
  }
  if (isReject) {
    return {
      textColor: 'var(--reject)',
      pillFill: 'var(--reject-soft)',
      pillStroke: 'var(--reject)',
    };
  }
  if (isActive) {
    return {
      textColor: 'var(--accent)',
      pillFill: 'var(--accent-soft)',
      pillStroke: 'var(--accent)',
    };
  }
  return {
    textColor: hasBuiltInHandler ? 'var(--accent)' : 'var(--ink-primary)',
    pillFill: 'var(--accent-soft)',
    pillStroke: 'var(--accent)',
  };
}

export function SchemaDiagramCanvas({
  schema,
  activeNodeId,
  status,
  compact: _compact = false,
  viewportTransform,
  onInspectBuiltIn,
}: SchemaDiagramCanvasProps) {
  const uid = useId().replace(/:/g, '');
  const markerId = `lp-arrow-${uid}`;
  const markerActiveId = `lp-arrow-active-${uid}`;

  const bounds = computeSchemaBounds(schema);
  const nodeMap = new Map<string, SchemaNode>();
  const metricsMap = new Map<string, NodeMetrics>();

  for (const n of schema.nodes) {
    nodeMap.set(n.id, n);
    metricsMap.set(n.id, getNodeMetrics(n));
  }

  const edgeMap = new Map<string, SchemaEdge>();
  for (const e of schema.edges) {
    if (!e.isSelfLoop && e.from !== e.to && !edgeMap.has(`${e.from}\0${e.to}`)) {
      edgeMap.set(`${e.from}\0${e.to}`, e);
    }
  }
  const upwardSelfLoopIds = new Set(
    schema.edges
      .filter(
        (e) =>
          (e.isSelfLoop || e.from === e.to) &&
          Math.sin(((e.loopAngleDeg ?? -90) * Math.PI) / 180) < -0.15,
      )
      .map((e) => e.from),
  );

  const diagramContent = (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8.2"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto"
        >
          <path d="M 0.5 1.4 L 9.2 5 L 0.5 8.6 L 2.2 5 z" fill="var(--ink-secondary)" />
        </marker>
        <marker
          id={markerActiveId}
          viewBox="0 0 10 10"
          refX="8.2"
          refY="5"
          markerWidth="6.8"
          markerHeight="6.8"
          orient="auto"
        >
          <path d="M 0.5 1.4 L 9.2 5 L 0.5 8.6 L 2.2 5 z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* Incoming > entry chevrons before start nodes */}
      {schema.nodes.map((node) => {
        const m = metricsMap.get(node.id)!;
        if (!m.isStart) return null;
        const isActive = activeNodeId === node.id;
        const cy = node.sublabel ? node.y - 6 : node.y;
        const tipX = node.x - Math.max(m.w / 2 + 3, m.textW / 2 + 12);

        return (
          <path
            key={`entry-${node.id}`}
            d={`M ${tipX - 8} ${cy - 5.5} L ${tipX} ${cy} L ${tipX - 8} ${cy + 5.5}`}
            fill="none"
            stroke={isActive ? 'var(--accent)' : 'var(--ink-primary)'}
            strokeWidth={isActive ? 2.4 : 2.05}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Edges & Condition Labels */}
      {schema.edges.map((edge) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;

        const fromM = metricsMap.get(from.id)!;
        const toM = metricsMap.get(to.id)!;
        const isFromActive = activeNodeId === from.id;
        const strokeColor = isFromActive ? 'var(--accent)' : 'var(--ink-secondary)';
        const strokeWidth = isFromActive ? 2.1 : 1.65;
        const marker = `url(#${isFromActive ? markerActiveId : markerId})`;

        // 1. Self-loops
        if (edge.isSelfLoop || edge.from === edge.to) {
          const angleDeg = edge.loopAngleDeg ?? -90;
          let d: string;
          let lx: number;
          let ly: number;

          if (Math.abs(angleDeg + 90) <= 25) {
            const topY = from.y - fromM.h / 2 - 2;
            const x1 = from.x - 9;
            const x2 = from.x + 9;
            d = `M ${x1} ${topY} C ${from.x - 24} ${topY - 44}, ${from.x + 24} ${topY - 44}, ${x2} ${topY - 2}`;
            lx = from.x;
            ly = topY - 38;
          } else {
            const rad = (angleDeg * Math.PI) / 180;
            const a = fromM.w / 2 + 3;
            const b = fromM.h / 2 + 3;
            const rAtAngle = (a * b) / Math.hypot(b * Math.cos(rad), a * Math.sin(rad));
            const spread = 0.34;
            const p1x = from.x + rAtAngle * Math.cos(rad - spread);
            const p1y = from.y + rAtAngle * Math.sin(rad - spread);
            const p2x = from.x + (rAtAngle + 2) * Math.cos(rad + spread);
            const p2y = from.y + (rAtAngle + 2) * Math.sin(rad + spread);
            const cDist = rAtAngle + 44;
            const c1x = from.x + cDist * Math.cos(rad - 0.52);
            const c1y = from.y + cDist * Math.sin(rad - 0.52);
            const c2x = from.x + cDist * Math.cos(rad + 0.52);
            const c2y = from.y + cDist * Math.sin(rad + 0.52);
            d = `M ${p1x} ${p1y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2x} ${p2y}`;
            lx = from.x + (rAtAngle + 38) * Math.cos(rad);
            ly = from.y + (rAtAngle + 38) * Math.sin(rad);
          }

          return (
            <g key={edge.id}>
              <path
                d={d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                markerEnd={marker}
              />
              {edge.label && (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={EDGE_FONT_SIZE}
                  fontWeight={600}
                  fill={isFromActive ? 'var(--accent)' : 'var(--ink-primary)'}
                  stroke="var(--bg-surface)"
                  strokeWidth={6}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {renderLpSvgLabel(edge.label, edge.id)}
                </text>
              )}
            </g>
          );
        }

        // 2. Crisp rounded-corner top bracket return loops
        if (isTopBracketEdge(edge, from, to)) {
          const bracket = getTopBracketGeometry(
            edge,
            from,
            to,
            fromM,
            toM,
            schema.nodes,
            upwardSelfLoopIds,
            getNodeMetrics,
          );
          return (
            <g key={edge.id}>
              <path
                d={bracket.d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={marker}
              />
              {edge.label && (
                <text
                  x={bracket.labelX}
                  y={bracket.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={EDGE_FONT_SIZE}
                  fontWeight={600}
                  fill={isFromActive ? 'var(--accent)' : 'var(--ink-primary)'}
                  stroke="var(--bg-surface)"
                  strokeWidth={6}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {renderLpSvgLabel(edge.label, edge.id)}
                </text>
              )}
            </g>
          );
        }

        const reverseEdge = edgeMap.get(`${edge.to}\0${edge.from}`);
        const reverseAlreadyRouted = Boolean(
          reverseEdge &&
            ((reverseEdge.curveOffset ?? 0) !== 0 ||
              isTopBracketEdge(reverseEdge, to, from)),
        );
        const hasUnroutedReverse = Boolean(reverseEdge && !reverseAlreadyRouted);
        const curve = edge.curveOffset ?? (hasUnroutedReverse ? 26 : 0);

        // 3. Curved forward/bottom/bidirectional edges
        if (curve !== 0) {
          let sx: number;
          let sy: number;
          let ex: number;
          let ey: number;
          let ctrlX: number;
          let ctrlY: number;

          if (
            edge.curveOffset !== undefined &&
            Math.abs(from.y - to.y) <= 24 &&
            !edge.fromAnchor &&
            !edge.toAnchor
          ) {
            sx = from.x;
            ex = to.x;
            if (curve < 0) {
              sy = from.y - fromM.h / 2 - 4;
              ey = to.y - toM.h / 2 - 6;
              ctrlY = Math.min(sy, ey) + curve * 0.85;
            } else {
              sy = from.y + fromM.h / 2 + 4;
              ey = to.y + toM.h / 2 + 6;
              ctrlY = Math.max(sy, ey) + curve * 0.85;
            }
            ctrlX = (from.x + to.x) / 2;
          } else {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.hypot(dx, dy) || 1;
            const nx = -dy / dist;
            const ny = dx / dist;
            ctrlX = (from.x + to.x) / 2 + nx * curve;
            ctrlY = (from.y + to.y) / 2 + ny * curve;

            const startPt = edge.fromAnchor
              ? getAnchorPoint(from, fromM, edge.fromAnchor, 5)
              : clipLineToRect(from.x, from.y, ctrlX, ctrlY, fromM.w, fromM.h, 5);
            const endPt = edge.toAnchor
              ? getAnchorPoint(to, toM, edge.toAnchor, 6)
              : clipLineToRect(to.x, to.y, ctrlX, ctrlY, toM.w, toM.h, 6);
            sx = startPt.x;
            sy = startPt.y;
            ex = endPt.x;
            ey = endPt.y;
          }

          const d = `M ${sx} ${sy} Q ${ctrlX} ${ctrlY} ${ex} ${ey}`;
          const labelX = 0.25 * sx + 0.5 * ctrlX + 0.25 * ex;
          const labelY = 0.25 * sy + 0.5 * ctrlY + 0.25 * ey;

          return (
            <g key={edge.id}>
              <path
                d={d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                markerEnd={marker}
              />
              {edge.label && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={EDGE_FONT_SIZE}
                  fontWeight={600}
                  fill={isFromActive ? 'var(--accent)' : 'var(--ink-primary)'}
                  stroke="var(--bg-surface)"
                  strokeWidth={6}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {renderLpSvgLabel(edge.label, edge.id)}
                </text>
              )}
            </g>
          );
        }

        // 4. Clean straight forward / downward edges
        let startPt = edge.fromAnchor
          ? getAnchorPoint(from, fromM, edge.fromAnchor, 5)
          : clipLineToRect(from.x, from.y, to.x, to.y, fromM.w, fromM.h, 5);
        let endPt = edge.toAnchor
          ? getAnchorPoint(to, toM, edge.toAnchor, 6)
          : clipLineToRect(to.x, to.y, from.x, from.y, toM.w, toM.h, 6);

        // Guard against inverted arrowheads when nodes are unusually close
        const dot =
          (endPt.x - startPt.x) * (to.x - from.x) +
          (endPt.y - startPt.y) * (to.y - from.y);
        if (dot <= 0) {
          startPt = clipLineToRect(from.x, from.y, to.x, to.y, fromM.w, fromM.h, 1);
          endPt = clipLineToRect(to.x, to.y, from.x, from.y, toM.w, toM.h, 2);
        }

        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2;
        const isHorizontal = Math.abs(endPt.y - startPt.y) <= 12;
        const labelY = isHorizontal ? midY - 11 : midY;

        return (
          <g key={edge.id}>
            <line
              x1={startPt.x}
              y1={startPt.y}
              x2={endPt.x}
              y2={endPt.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              markerEnd={marker}
            />
            {edge.label && (
              <text
                x={midX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={EDGE_FONT_SIZE}
                fontWeight={600}
                fill={isFromActive ? 'var(--accent)' : 'var(--ink-primary)'}
                stroke="var(--bg-surface)"
                strokeWidth={6}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {renderLpSvgLabel(edge.label, edge.id)}
              </text>
            )}
          </g>
        );
      })}

      {/* Pure typographic L&P Nodes (zero circles, zero resting boxes) */}
      {schema.nodes.map((node) => {
        const m = metricsMap.get(node.id)!;
        const isActive = activeNodeId === node.id;
        const isBuiltIn = Boolean(node.builtinId && onInspectBuiltIn);
        const palette = getNodePalette(node, m.cleanLabel, isActive, status, isBuiltIn);

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            data-schema-interactive={isBuiltIn ? 'true' : undefined}
            onClick={
              isBuiltIn && node.builtinId
                ? () => onInspectBuiltIn!(node.builtinId!)
                : undefined
            }
            className={isBuiltIn ? 'cursor-pointer transition-opacity hover:opacity-80' : undefined}
          >
            {/* Active execution highlight pill ONLY */}
            {isActive && (
              <rect
                x={-m.w / 2}
                y={-m.h / 2}
                width={m.w}
                height={m.h}
                rx={10}
                fill={palette.pillFill}
                stroke={palette.pillStroke}
                strokeWidth={1.5}
              />
            )}

            <text
              y={node.sublabel ? -6 : 0}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={NODE_FONT_SIZE}
              fontWeight={isActive ? 700 : 600}
              letterSpacing="-0.01em"
              fill={palette.textColor}
            >
              {renderLpSvgLabel(m.cleanLabel, node.id)}
            </text>

            {node.sublabel && (
              <text
                y={13}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={SUBLABEL_FONT_SIZE}
                fontWeight={500}
                fill={isActive ? palette.textColor : 'var(--ink-muted)'}
              >
                {renderLpSvgLabel(node.sublabel, `${node.id}-sub`)}
              </text>
            )}
          </g>
        );
      })}
    </>
  );

  if (viewportTransform) {
    return (
      <svg
        className="h-full w-full touch-none select-none font-sans"
        role="img"
        aria-label={schema.title}
      >
        <g
          transform={`translate(${viewportTransform.x}, ${viewportTransform.y}) scale(${viewportTransform.scale})`}
        >
          {diagramContent}
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none font-sans"
      role="img"
      aria-label={schema.title}
    >
      {diagramContent}
    </svg>
  );
}
