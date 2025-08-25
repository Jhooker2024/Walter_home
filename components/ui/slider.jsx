export function Slider({
  min = 0,
  max = 4,
  step = 1,
  value,
  onValueChange,
  className,
}) {
  return (
    <input
      type="range"
      inputMode="none" // 🔒 prevents mobile keyboard from opening
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange([parseInt(e.target.value)])}
      className={`w-full accent-[#4840BB] ${className || ''}`}
    />
  );
}
