export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FFF7FE] font-['Fredoka']">
      {children}
    </div>
  );
}
