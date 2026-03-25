"use server";

import { revalidatePath } from "next/cache";
import {
  createSystemAdmin,
  setSystemAdminStatus,
  updateSystemAdminPassword,
} from "@/lib/users";

export async function createSystemAdminAction(formData: FormData) {
  await createSystemAdmin({
    setupSecret: String(formData.get("setupSecret") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  revalidatePath("/super-admin");
}

export async function changeSystemAdminPasswordAction(formData: FormData) {
  await updateSystemAdminPassword({
    setupSecret: String(formData.get("setupSecret") ?? ""),
    userId: String(formData.get("userId") ?? "").trim(),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  revalidatePath("/super-admin");
}

export async function toggleSystemAdminAction(formData: FormData) {
  await setSystemAdminStatus({
    setupSecret: String(formData.get("setupSecret") ?? ""),
    userId: String(formData.get("userId") ?? "").trim(),
    disabled: String(formData.get("disabled") ?? "") === "true",
  });
  revalidatePath("/super-admin");
}
