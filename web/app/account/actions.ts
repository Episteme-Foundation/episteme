"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "../../auth";
import {
  createApiKey,
  revokeApiKey,
  AccountApiError,
} from "../../lib/account-api";

export interface CreateKeyState {
  plaintext?: string;
  name?: string;
  error?: string;
}

// The acting identity always comes from the server session — never from the
// form — so a forged request can only ever operate on its own account.
export async function createKeyAction(
  _prev: CreateKeyState,
  formData: FormData
): Promise<CreateKeyState> {
  const session = await auth();
  if (!session?.externalId) return { error: "Not signed in." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name." };
  try {
    const created = await createApiKey(session.externalId, name);
    revalidatePath("/account");
    return { plaintext: created.key, name: created.name };
  } catch (err) {
    const message =
      err instanceof AccountApiError ? err.message : "Key creation failed.";
    return { error: message };
  }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.externalId) return;
  const keyId = String(formData.get("key_id") ?? "");
  if (!keyId) return;
  try {
    await revokeApiKey(session.externalId, keyId);
  } catch (err) {
    console.error("[account] revoke failed:", err);
  }
  revalidatePath("/account");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
