/** أرقام المراحل الدراسية المعروضة عند الجدولة وتعريف القاعات — حسب تسمية الكلية */
export function getCollegeStageLevelOptions(collegeLabel: string): number[] {
  const name = collegeLabel.trim();
  if (name.includes("كلية الطب") || name.includes("كلية طب الزهراء")) return [1, 2, 3, 4, 5, 6];
  if (name.includes("كلية الصيدلة") || name.includes("كلية طب الاسنان")) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4];
}
