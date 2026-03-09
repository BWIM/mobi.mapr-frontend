import { Injectable, signal, computed, effect } from '@angular/core';
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

  // Computed signal to determine the current access method
  readonly accessMethod = computed(() => {
    if (this._isAuthenticated() && this._projectId()) {
      return 'project_id' as const;
    }
    if (this._shareKey()) {
      return 'share_key' as const;
    }
    return null;
  });

  // Computed signal to get the current identifier (project_id or share_key)
  readonly currentIdentifier = computed(() => {
    return this._projectId() || this._shareKey() || null;
  });

  constructor() {
    // Initialize authentication state from AuthService
    this._isAuthenticated.set(this.authService.isLoggedIn());

    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe(user => {
      this._isAuthenticated.set(!!user);
      // Clear project_id if user logs out
      if (!user) {
        this._projectId.set(null);
      }
    });

    // Effect to ensure only one access method is active at a time
    effect(() => {
      const isAuth = this._isAuthenticated();
      const projectId = this._projectId();
      const shareKey = this._shareKey();

      // If authenticated and has project_id, clear share_key
      if (isAuth && projectId) {
        if (shareKey) {
          this._shareKey.set(null);
        }
      }
      // If using share_key, ensure we're not authenticated or clear project_id
      if (shareKey && isAuth && projectId) {
        this._projectId.set(null);
      }
    });
  }

  /**
   * Set the project ID (for authenticated users)
   */
  setProjectId(projectId: string | null): void {
    this._projectId.set(projectId);
    // Clear share_key when setting project_id
    if (projectId) {
      this._shareKey.set(null);
    }
  }

  /**
   * Set the share key (for unauthenticated users)
   */
  setShareKey(shareKey: string | null): void {
    this._shareKey.set(shareKey);
    // Clear project_id when setting share_key
    if (shareKey) {
      this._projectId.set(null);
    }
  }

  /**
   * Clear all session data
   */
  clearSession(): void {
    this._projectId.set(null);
    this._shareKey.set(null);
  }

  /**
   * Get the current project ID value
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
