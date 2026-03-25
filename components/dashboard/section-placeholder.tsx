type Props = {
  title: string;
  description?: string;
};

export function SectionPlaceholder({ title, description }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-[#1E3A8A]">{title}</h1>
      {description ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      <p className="mt-4 inline-flex rounded-xl bg-[#F8FAFC] px-4 py-2 text-sm text-slate-500 ring-1 ring-slate-200/80">
        هذا القسم قيد الإنشاء وسيُربط لاحقًا بالبيانات الفعلية.
      </p>
    </div>
  );
}
