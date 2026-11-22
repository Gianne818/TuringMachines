let supportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

/**
 * Gracefully animates native <dialog> close across browsers that lack
 * native overlay / discrete display transitions (Firefox, Safari).
 */
export async function closeDialogWithFallback(
  dialog: HTMLDialogElement | null,
  onClosed?: () => void,
): Promise<void> {
  if (!dialog || !dialog.open) {
    onClosed?.();
    return;
  }

  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }

  if (dialog.open) {
    dialog.close();
  }
  onClosed?.();
}

/**
 * Attaches light-dismiss fallback when HTMLDialogElement lacks closedBy (Safari).
 * Requires both pointerdown and pointerup outside dialog rect so drag selections don't close.
 */
export function attachDialogLightDismiss(
  dialog: HTMLDialogElement,
  onRequestClose: () => void,
): () => void {
  const handleCancel = (e: Event) => {
    e.preventDefault();
    onRequestClose();
  };
  dialog.addEventListener('cancel', handleCancel);

  if ('closedBy' in HTMLDialogElement.prototype) {
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
    };
  }

  const isOutside = (e: PointerEvent) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  let pressedOutside = false;
  const onPointerDown = (e: PointerEvent) => {
    pressedOutside = isOutside(e);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (pressedOutside && isOutside(e)) {
      onRequestClose();
    }
    pressedOutside = false;
  };

  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointerup', onPointerUp);

  return () => {
    dialog.removeEventListener('cancel', handleCancel);
    dialog.removeEventListener('pointerdown', onPointerDown);
    dialog.removeEventListener('pointerup', onPointerUp);
  };
}
