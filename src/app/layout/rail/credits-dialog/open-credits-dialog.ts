import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import type { CreditsDialogComponent } from './credits-dialog.component';

/** Opens the credits dialog, loaded on demand (shared by the desktop rail and the mobile filter panel). */
export async function openCreditsDialog(dialog: MatDialog): Promise<MatDialogRef<CreditsDialogComponent>> {
  const { CreditsDialogComponent } = await import('./credits-dialog.component');
  return dialog.open(CreditsDialogComponent, {
    width: '800px',
    maxWidth: '90vw',
    maxHeight: '90vh'
  });
}
