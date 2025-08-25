export function StickyHeader({ title }) {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 w-full bg-[#F9FAFB] pt-6 pb-4 flex flex-col items-center border-b border-gray-200 shadow-sm">
        <img src="/logo.png" alt="Walter Logo" className="w-32 mb-4" />
        <h1 className="text-2xl font-semibold text-center">{title}</h1>
      </div>
      <div className="h-52" />
    </>
  )
}

