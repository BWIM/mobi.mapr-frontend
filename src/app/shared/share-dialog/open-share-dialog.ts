import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ShareDialogComponent } from './share-dialog.component';

/** Opens the share dialog with consistent sizing on desktop and mobile. */
export function openShareDialog(dialog: MatDialog): MatDialogRef<ShareDialogComponent> {
  return dialog.open(ShareDialogComponent, {
    maxWidth: '95vw',
    autoFocus: false,
  });
}
