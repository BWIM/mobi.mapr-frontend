import { Injectable, signal, computed } from '@angular/core';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class DashboardSessionService {
  private authService = inject(AuthService);

  // Signals for session state
  private _projectId = signal<string | null>(null);
  private _shareKey = signal<string | null>(null);
  private _isAuthenticated = signal<boolean>(false);

  // Public readonly signals
  readonly projectId = this._projectId.asReadonly();
  readonly shareKey = this._shareKey.asReadonly();
  readonly isAuthenticated = this._isAuthenticated.asReadonly();

  /**
   * `share_key` whenever a share key is set: share viewers keep their key (it decides their rights)
   * and use `projectId` for the project they currently look at (the share's own project or a
   * sibling). Logged-in users never hold a share key (DashboardComponent clears it).
   */
  readonly accessMethod = computed(() => {
    if (this._shareKey()) {
      return 'share_key' as const;
    }
    if (this._isAuthenticated() && this._projectId()) {
      return 'project_id' as const;
    }
    return null;
  });

  // Computed signal to get the current identifier (project_id or share_key)
  readonly currentIdentifier = computed(() => {
    return this._shareKey() || this._projectId() || null;
  });

  constructor() {
    // Initialize authentication state from AuthService
    this._isAuthenticated.set(this.authService.isLoggedIn());

    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe(user => {
      this._isAuthenticated.set(!!user);
      // Clear project_id if user logs out (unless it belongs to a share-key session)
      if (!user && !this._shareKey()) {
        this._projectId.set(null);
      }
    });
  }

  /**
   * Set the current project ID. Logged-in users: the project they opened.
   * Share viewers: the project shown with their share key (does not touch the key).
   */
  setProjectId(projectId: string | null): void {
    this._projectId.set(projectId);
  }

  /**
   * Set the share key (for unauthenticated users). Does not touch the project ID.
   */
  setShareKey(shareKey: string | null): void {
    this._shareKey.set(shareKey);
  }

  /**
   * Clear all session data
   */
  clearSession(): void {
    this._projectId.set(null);
    this._shareKey.set(null);
  }

  /**
   * Get the current project ID value (authenticated users)
   */
  getProjectId(): string | null {
    return this._projectId();
  }

  /**
   * Get the current share key value
   */
  getShareKey(): string | null {
    return this._shareKey();
  }

  /**
   * Check if user is authenticated
   */
  getIsAuthenticated(): boolean {
    return this._isAuthenticated();
  }

  /**
   * Get the current access method
   */
  getAccessMethod(): 'project_id' | 'share_key' | null {
    return this.accessMethod();
  }

  /**
   * Get the current identifier (project_id or share_key)
   */
  getCurrentIdentifier(): string | null {
    return this.currentIdentifier();
  }
}
