export function StickyHeader({ title, children }) {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 w-full bg-[#F9FAFB] pt-6 pb-4 border-b border-gray-200 shadow-sm">
        <div className="relative flex flex-col items-center">
          <img src="/logo.png" alt="Walter Logo" className="w-32 mb-4" />
          <h1 className="text-2xl font-semibold text-center">{title}</h1>
          {/* top-right slot (mobile only) */}
          <div className="absolute top-0 right-4 mt-2 md:hidden">{children}</div>
        </div>
      </div>
      <div className="h-52" />
    </>
  )
}

