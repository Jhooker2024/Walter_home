export function Button({ children, ...props }) {
  return <button {...props} className="px-4 py-2 rounded bg-[#4840BB] text-white">{children}</button>;
}
