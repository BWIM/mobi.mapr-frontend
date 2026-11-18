import { TemplateRef, Type } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import type { InfoDialogComponent } from './info-dialog.component';

/** Default size of the info dialog on desktop. */
const INFO_DIALOG_CONFIG: MatDialogConfig = {
  width: '80vw',
  height: '80vh',
  maxWidth: '80vw',
  maxHeight: '80vh',
  panelClass: 'info-dialog-panel',
};

/**
 * Opens the info dialog with a template or component as content.
 * The dialog is loaded on demand so it is not part of the initial/dashboard bundle.
 */
export async function openInfoDialog(
  dialog: MatDialog,
  content: TemplateRef<unknown> | Type<unknown>,
  config: MatDialogConfig = {},
): Promise<MatDialogRef<InfoDialogComponent>> {
  const { InfoDialogComponent } = await import('./info-dialog.component');
  return dialog.open(InfoDialogComponent, {
    ...INFO_DIALOG_CONFIG,
    ...config,
    data: { content },
  });
}

/** Opens the map legend explanation in the info dialog. */
export async function openLegendInfoDialog(
  dialog: MatDialog,
  config: MatDialogConfig = {},
): Promise<MatDialogRef<InfoDialogComponent>> {
  const { LegendInfoComponent } = await import('../legend-info/legend-info.component');
  return openInfoDialog(dialog, LegendInfoComponent, config);
}
