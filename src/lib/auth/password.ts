import { z } from "zod";

/** Password rules shared by the user's own form and the temporary passwords set by an admin. */
export const passwordSchema = z
  .string()
  .min(10, { message: "10 caractères minimum." })
  .regex(/[a-z]/, { message: "Au moins une minuscule." })
  .regex(/[A-Z]/, { message: "Au moins une majuscule." })
  .regex(/[0-9]/, { message: "Au moins un chiffre." })
  .regex(/[^a-zA-Z0-9]/, { message: "Au moins un caractère spécial." });

/** app_metadata flag: the account still uses a temporary password set by an admin. */
export const MUST_CHANGE_PASSWORD = "must_change_password";
