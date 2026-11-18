import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import type { ShareDialogComponent } from './share-dialog.component';

/** Opens the share dialog (loaded on demand) with consistent sizing on desktop and mobile. */
export async function openShareDialog(dialog: MatDialog): Promise<MatDialogRef<ShareDialogComponent>> {
  const { ShareDialogComponent } = await import('./share-dialog.component');
  return dialog.open(ShareDialogComponent, {
    maxWidth: '95vw',
    autoFocus: false,
  });
}
