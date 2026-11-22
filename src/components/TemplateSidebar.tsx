import { useState } from 'react';
import {
  Binary,
  Calculator,
  ChevronDown,
  ChevronRight,
  Cpu,
  GitBranch,
  Layers,
  Scale,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import type { TemplateCategory, TuringMachineDefinition } from '../engine/types';
import { ALL_TEMPLATES, TEMPLATE_CATEGORIES } from '../templates';

interface TemplateSidebarProps {
  open: boolean;
  activeMachineId: string;
  customMachines: Record<string, TuringMachineDefinition>;
  onSelectTemplate: (machine: TuringMachineDefinition) => void;
  onCloseMobile: () => void;
}

const CATEGORY_ICON: Record<TemplateCategory, typeof Calculator> = {
  'unary-arithmetic': Calculator,
  regular: GitBranch,
  'context-free': Layers,
  'binary-logic': Binary,
  comparison: Scale,
  'classic-tm': Cpu,
  builtin: Wrench,
};

export function TemplateSidebar({
  open,
  activeMachineId,
  customMachines,
  onSelectTemplate,
  onCloseMobile,
}: TemplateSidebarProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const mergedTemplates = ALL_TEMPLATES.map((t) => customMachines[t.id] ?? t);

  // Include any brand-new custom machines not matching a predefined ID
  const customOnly = Object.values(customMachines).filter(
    (cm) => !ALL_TEMPLATES.some((t) => t.id === cm.id),
  );
  const allMachines = [...customOnly, ...mergedTemplates];

  const filtered = q
    ? allMachines.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.sampleInputs.some(
            (s) =>
              s.input.toLowerCase().includes(q) ||
              s.expectedOutput.toLowerCase().includes(q),
          ),
      )
    : allMachines;

  const content = (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-r"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Turing Machine Templates"
    >
      {/* Search Box */}
      <div
        className="flex items-center gap-2 border-b p-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: 'var(--ink-muted)' }}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search Turing machine templates"
            className="h-8 w-full rounded-xl border pl-8 pr-3 text-xs"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="pressable rounded-lg border p-1.5 lg:hidden"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--ink-secondary)',
          }}
          aria-label="Close templates menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Category List */}
      <div className="custom-scroll flex-1 space-y-2 overflow-y-auto p-2.5">
        {customOnly.length > 0 && (
          <div className="space-y-1">
            <div
              className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ink-muted)' }}
            >
              Custom Machines
            </div>
            {customOnly
              .filter((m) => filtered.some((f) => f.id === m.id))
              .map((m) => (
                <TemplateRow
                  key={m.id}
                  machine={m}
                  isActive={m.id === activeMachineId}
                  onSelect={() => {
                    onSelectTemplate(m);
                    onCloseMobile();
                  }}
                />
              ))}
          </div>
        )}

        {TEMPLATE_CATEGORIES.map((cat) => {
          const items = filtered.filter(
            (m) => m.category === cat.id && !customOnly.some((c) => c.id === m.id),
          );
          if (items.length === 0) return null;

          const Icon = CATEGORY_ICON[cat.id];
          const isCollapsed = Boolean(collapsed[cat.id]) && !q;

          return (
            <div key={cat.id} className="space-y-1">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                }
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--ink-muted)' }}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{cat.shortLabel}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[10px] tabular-nums">{items.length}</span>
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>

              {!isCollapsed && (
                <div className="space-y-1">
                  {items.map((m) => (
                    <TemplateRow
                      key={m.id}
                      machine={m}
                      isActive={m.id === activeMachineId}
                      onSelect={() => {
                        onSelectTemplate(m);
                        onCloseMobile();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>
            No templates match “{query}”.
          </p>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent panel */}
      <div className="hidden h-full lg:block">{content}</div>

      {/* Mobile slide-over drawer */}
      <div className="fixed inset-0 z-40 flex lg:hidden">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
        <div className="relative z-10 h-full shadow-2xl">{content}</div>
      </div>
    </>
  );
}

function TemplateRow({
  machine,
  isActive,
  onSelect,
}: {
  machine: TuringMachineDefinition;
  isActive: boolean;
  onSelect: () => void;
}) {
  const sample = machine.sampleInputs[0];
  const badgeText =
    machine.kind === 'decider'
      ? 'Decider'
      : machine.kind === 'builtin'
        ? 'Built-in'
        : 'Computer';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="pressable flex w-full flex-col gap-1 rounded-xl border px-2.5 py-2 text-left"
      style={{
        backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
        borderColor: isActive ? 'var(--accent)' : 'transparent',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-xs font-semibold leading-snug"
          style={{ color: isActive ? 'var(--accent)' : 'var(--ink-primary)' }}
        >
          {machine.name}
          {machine.isCustom ? ' *' : ''}
        </span>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color:
              machine.kind === 'decider'
                ? 'var(--accept)'
                : machine.kind === 'builtin'
                  ? 'var(--accent)'
                  : 'var(--ink-muted)',
          }}
        >
          {badgeText}
        </span>
      </div>

      {sample && (
        <div
          className="truncate text-[10.5px] font-medium tabular-nums"
          style={{ color: 'var(--ink-muted)' }}
        >
          {sample.input} → {sample.expectedOutput}
        </div>
      )}
    </button>
  );
}
