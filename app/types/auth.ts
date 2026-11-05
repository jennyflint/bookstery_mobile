export interface GoogleUser {
  id: string;
  email: string;
  displayName: string;
  imageUrl?: string;
  accessToken: string;
}

export interface UserSession {
  id: number;
  email: string | null;
  display_name: string | null;
  last_sync_at: number | null;
  drive_folder_id?: string | null;
}

export interface AuthState {
  user: GoogleUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface BooksteryGoogleAuthResponse {
  id: string;
  email: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  imageUrl?: string | null;
  accessToken: string;
  authentication: {
    accessToken: string;
    idToken?: string;
  };
}

export interface BooksteryGoogleAuthRefreshResponse {
  accessToken: string;
  authentication: {
    accessToken: string;
    idToken?: string;
  };
}

export interface BooksteryGoogleAuthPlugin {
  initialize(options?: {
    scopes?: string[];
    grantOfflineAccess?: boolean;
    clientId?: string;
  }): Promise<void>;
  signIn(): Promise<BooksteryGoogleAuthResponse>;
  refresh(): Promise<BooksteryGoogleAuthRefreshResponse>;
  signOut(): Promise<void>;
}
