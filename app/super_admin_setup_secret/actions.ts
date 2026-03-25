"use server";

import { revalidatePath } from "next/cache";
import { assertValidSuperAdminGatePin } from "@/lib/super-admin-gate";
import { createSystemAdminWithGatePin } from "@/lib/users";

export async function confirmSuperAdminGatePin(pin: string): Promise<{ ok: boolean }> {
  try {
    assertValidSuperAdminGatePin(pin);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** ناتج الإجراء (لا يُعاد null من الخادم) */
export type CreateAdminViaGateFormState =
  | { status: "success" }
  | { status: "error"; message: string };

export async function createAdminViaGateAction(
  _prev: CreateAdminViaGateFormState | null,
  formData: FormData
): Promise<CreateAdminViaGateFormState> {
  const gatePin = String(formData.get("gatePin") ?? "");
  try {
    await createSystemAdminWithGatePin({
      gatePin,
      fullName: String(formData.get("fullName") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "تعذر إنشاء الحساب.";
    return { status: "error", message };
  }

  revalidatePath("/super_admin_setup_secret");
  revalidatePath("/super-admin");
  return { status: "success" };
}
