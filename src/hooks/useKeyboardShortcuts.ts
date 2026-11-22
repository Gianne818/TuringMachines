import { useEffect } from 'react';

export interface ShortcutHandlers {
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  onViewMode: (mode: 'split' | 'diagram' | 'trace') => void;
  onOpenBuiltIns: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Skip shortcuts if a native modal dialog is currently open
      if (document.querySelector('dialog[open]')) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlers.onTogglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handlers.onStepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlers.onStepBack();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handlers.onReset();
          break;
        case '1':
          e.preventDefault();
          handlers.onViewMode('split');
          break;
        case '2':
          e.preventDefault();
          handlers.onViewMode('diagram');
          break;
        case '3':
          e.preventDefault();
          handlers.onViewMode('trace');
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          handlers.onOpenBuiltIns();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
