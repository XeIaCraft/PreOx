function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill in your Supabase project credentials.`
    );
  }
  return value;
}

export function getSupabaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabasePublishableKey() {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getElProfesorGeminiApiKey() {
  return required("EL_PROFESOR_GEMINI_API_KEY", process.env.EL_PROFESOR_GEMINI_API_KEY);
}
