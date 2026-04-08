import { revalidatePath } from "next/cache";

/** لمسار نسبي تحت بوابة التشكيل/القسم، مثل `study-subjects` أو `upload-status/12`. نص فارغ = جذر البوابة. */
export function revalidateCollegePortalSegment(segment: string) {
  const s = segment.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!s) {
    revalidatePath("/dashboard/college");
    revalidatePath("/department");
    return;
  }
  revalidatePath(`/dashboard/college/${s}`);
  revalidatePath(`/department/${s}`);
}
