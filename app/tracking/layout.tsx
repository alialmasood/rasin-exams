export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-dvh bg-[#f4f8ff] text-[#0f2f57]">
      {children}
    </div>
  );
}
