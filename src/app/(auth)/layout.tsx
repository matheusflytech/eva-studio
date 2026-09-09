export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-4">
      <div className="mb-8 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/eva-mark.png" alt="" width={28} height={28} />
        <span className="font-display text-[15px] font-bold uppercase tracking-wide text-text-primary">
          Eva
        </span>
      </div>
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
