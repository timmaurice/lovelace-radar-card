/**
 * Stand-ins for the Home Assistant elements the card renders, reduced to their
 * public contract: the slots they project and the properties they read.
 *
 * Under jsdom no HA element is defined, so a test that only queries the card's
 * own markup stays green while the real element ignores it. That is how the
 * marker dialog lost its title and buttons in HA 2026.3 without a single test
 * noticing. With these stand-ins, content aimed at a slot that does not exist
 * has no `assignedSlot`, and a property the element no longer has is simply not
 * read.
 *
 * Taken from the frontend at tag 20260826.7 (HA 2026.9):
 * - `src/components/ha-dialog.ts`
 * - `src/components/ha-dialog-footer.ts`
 * - `src/components/input/ha-input.ts` (with `wa-input-mixin.ts`)
 * - `src/components/ha-icon-button.ts`
 *
 * This is a second model of HA's element set and drifts when HA moves. The
 * end-to-end suite (`test/e2e/marker-dialog.spec.ts`) checks the same contract
 * against the real frontend.
 */

/** Elements HA has removed from its frontend, with the release that removed them. */
export const REMOVED_HA_ELEMENTS: Record<string, string> = {
  'ha-textfield': '2026.5',
  'ha-fab': '2026.5',
  'ha-radio': '2026.6',
  // Never existed in HA's frontend at all.
  'ha-form-radio': 'never',
};

/** Every custom element tag in `root`, descending into open shadow roots. */
export function renderedTags(root: ParentNode): string[] {
  const tags = new Set<string>();
  const walk = (node: ParentNode): void => {
    for (const el of Array.from(node.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (tag.includes('-')) tags.add(tag);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return [...tags];
}

/** Tags that HA no longer ships: the removed ones, and the whole mwc-* family. */
export function removedTags(root: ParentNode): string[] {
  return renderedTags(root).filter((tag) => tag in REMOVED_HA_ELEMENTS || tag.startsWith('mwc-'));
}

/** Direct children that no slot of their parent's shadow root takes in. */
export function unslottedChildren(host: Element): Element[] {
  return Array.from(host.children).filter((child) => child.assignedSlot === null);
}

/** Children of `host`, since jsdom's selector engine does not take `:scope >`. */
export function childrenMatching(host: Element, selector: string): Element[] {
  return Array.from(host.children).filter((child) => child.matches(selector));
}

class HaDialogStandIn extends HTMLElement {
  public headerTitle?: string;

  // `open` is a reflected boolean property on the real element.
  get open(): boolean {
    return this.hasAttribute('open');
  }

  set open(value: boolean) {
    this.toggleAttribute('open', value);
  }

  constructor() {
    super();
    // The slots `ha-dialog` renders, in its order. `primaryAction` and
    // `secondaryAction` are not among them: they moved to `ha-dialog-footer`.
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <slot name="header">
        <slot name="headerNavigationIcon"></slot>
        <slot name="headerTitle"></slot>
        <slot name="headerSubtitle"></slot>
        <slot name="headerActionItems"></slot>
      </slot>
      <slot></slot>
      <slot name="footer"></slot>
    `;
  }
}

class HaDialogFooterStandIn extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <footer>
        <slot name="secondaryAction"></slot>
        <slot name="primaryAction"></slot>
      </footer>
    `;
  }
}

class HaInputStandIn extends HTMLElement {
  public value?: string;
  public label?: string;
  public placeholder?: string;

  // `name` is a plain string property, so the attribute sets it.
  get name(): string | null {
    return this.getAttribute('name');
  }
}

class HaIconButtonStandIn extends HTMLElement {
  public label?: string;
  public path?: string;

  constructor() {
    super();
    // Only a default slot, for an `ha-icon` when no `path` is given.
    this.attachShadow({ mode: 'open' }).innerHTML = `<button><span><slot></slot></span></button>`;
  }
}

export function defineHaElementStandIns(): void {
  if (!customElements.get('ha-icon-button')) customElements.define('ha-icon-button', HaIconButtonStandIn);
  if (!customElements.get('ha-input')) customElements.define('ha-input', HaInputStandIn);
  if (!customElements.get('ha-dialog')) customElements.define('ha-dialog', HaDialogStandIn);
  if (!customElements.get('ha-dialog-footer')) customElements.define('ha-dialog-footer', HaDialogFooterStandIn);
}
