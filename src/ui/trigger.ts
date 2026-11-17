import { h, sheet } from '../dom.ts';
import triggerCss from '../styles/trigger.css';

export interface TriggerHandlers {
  onToggle: () => void;
  onPrefetch: () => void;
}

export interface TriggerView {
  host: HTMLElement;
  button: HTMLButtonElement;
  update(opts: {
    main: string;
    sub: string;
    disabled: boolean;
    ariaLabel: string;
    open: boolean;
    pending: boolean;
    error: string;
  }): void;
}

export function createTrigger(handlers: TriggerHandlers): TriggerView {
  const host = document.createElement('gemini-mendeleev-trigger');
  const root = host.attachShadow({ mode: 'open' });
  root.adoptedStyleSheets = [sheet(triggerCss)];

  const mainEl = h('span', { class: 'main' });
  const subEl = h('span', { class: 'sub' });
  const button = h(
    'button',
    {
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onclick: handlers.onToggle,
      onpointerenter: handlers.onPrefetch,
    },
    mainEl,
    subEl,
    h('span', { class: 'chev', 'aria-hidden': 'true' }),
  );
  root.append(button);

  return {
    host,
    button,
    update({ main, sub, disabled, ariaLabel, open, pending, error }) {
      if (mainEl.textContent !== main) mainEl.textContent = main;
      if (subEl.textContent !== sub) subEl.textContent = sub;
      button.disabled = disabled;
      button.setAttribute('aria-label', error ? `${ariaLabel}. ${error}` : ariaLabel);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-busy', String(pending));
      button.toggleAttribute('data-pending', pending);
      button.toggleAttribute('data-error', Boolean(error));
      if (error) button.title = error;
      else button.removeAttribute('title');
    },
  };
}
