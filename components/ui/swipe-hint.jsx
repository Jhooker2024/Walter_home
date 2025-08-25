export function SwipeHint({ show }) {
  if (!show) return null
  return (
    <div className="absolute top-4 right-4 text-xs text-[#111827] opacity-70 block md:hidden text-right leading-tight">
      <div>Swipe</div>
      <div>Next →</div>
      <div className="mt-2">Swipe</div>
      <div>← Back</div>
    </div>
  )
}

