import type { IControl, Map } from 'maplibre-gl';

/**
 * Map control that opens the export dialog. Lives in the top-right control
 * stack (below fullscreen) so it never overlaps the side panels.
 */
export class ExportMapControl implements IControl {
  private container?: HTMLElement;

  /**
   * `getLabel` is evaluated lazily so the tooltip follows language changes.
   * `isVisible` hides the control (e.g. when a share disables export); call `refresh()` after
   * it changes.
   */
  constructor(
    private readonly onClick: () => void,
    private readonly getLabel: () => string,
    private readonly isVisible: () => boolean = () => true,
  ) {}

  /** Re-applies `isVisible`. */
  refresh(): void {
    if (this.container) {
      this.container.hidden = !this.isVisible();
    }
  }

  onAdd(_map: Map): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group export-map-ctrl';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-map-ctrl__button';
    const syncLabel = () => {
      const label = this.getLabel();
      button.title = label;
      button.setAttribute('aria-label', label);
    };
    syncLabel();
    button.addEventListener('mouseenter', syncLabel);
    button.addEventListener('focus', syncLabel);
    button.addEventListener('click', () => this.onClick());

    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'download';
    button.appendChild(icon);

    container.appendChild(button);
    this.container = container;
    this.refresh();
    return container;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = undefined;
  }
}
