export type UserRole = "admin" | "user";
export type AppStatus = "available" | "coming_soon";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type AppModule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  route: string | null;
  status: AppStatus;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserAppAccess = {
  user_id: string;
  app_id: string;
  granted_at: string;
  granted_by: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      apps: {
        Row: AppModule;
        Insert: Partial<AppModule> & { slug: string; name: string };
        Update: Partial<AppModule>;
        Relationships: [];
      };
      user_app_access: {
        Row: UserAppAccess;
        Insert: Partial<UserAppAccess> & { user_id: string; app_id: string };
        Update: Partial<UserAppAccess>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
