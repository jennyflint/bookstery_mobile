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
