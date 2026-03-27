import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type CollegeHolidayRow = {
  id: string;
  owner_user_id: string;
  holiday_date: string;
  holiday_name: string;
  created_at: Date;
};

export async function listCollegeHolidaysByOwner(ownerUserId: string): Promise<CollegeHolidayRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    holiday_date: string;
    holiday_name: string;
    created_at: Date;
  }>(
    `SELECT id, owner_user_id, holiday_date::text, holiday_name, created_at
     FROM college_holidays
     WHERE owner_user_id = $1
     ORDER BY holiday_date ASC, created_at ASC`,
    [ownerUserId]
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    owner_user_id: String(x.owner_user_id),
    holiday_date: x.holiday_date,
    holiday_name: x.holiday_name,
    created_at: x.created_at,
  }));
}

export async function createCollegeHoliday(input: {
  ownerUserId: string;
  holidayDate: string;
  holidayName: string;
}): Promise<{ ok: true; row: CollegeHolidayRow } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  const holidayDate = input.holidayDate.trim();
  const holidayName = input.holidayName.trim();
  if (!holidayDate) return { ok: false, message: "يرجى تحديد تاريخ العطلة." };
  if (holidayName.length < 2) return { ok: false, message: "يرجى إدخال اسم عطلة صالح." };
  const pool = getDbPool();
  const ins = await pool.query<{ id: string | number }>(
    `INSERT INTO college_holidays (owner_user_id, holiday_date, holiday_name, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (owner_user_id, holiday_date, holiday_name) DO NOTHING
     RETURNING id`,
    [input.ownerUserId, holidayDate, holidayName]
  );
  if ((ins.rowCount ?? 0) === 0) return { ok: false, message: "العطلة موجودة مسبقًا." };
  const rows = await listCollegeHolidaysByOwner(input.ownerUserId);
  const row = rows.find((x) => x.id === String(ins.rows[0].id));
  if (!row) return { ok: false, message: "تمت الإضافة لكن تعذر تحميل العطلة." };
  return { ok: true, row };
}

export async function deleteCollegeHoliday(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف العطلة غير صالح." };
  const pool = getDbPool();
  const r = await pool.query(`DELETE FROM college_holidays WHERE id = $1 AND owner_user_id = $2`, [
    input.id.trim(),
    input.ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "العطلة غير موجودة أو لا تملك صلاحية حذفها." };
  return { ok: true, id: input.id.trim() };
}
