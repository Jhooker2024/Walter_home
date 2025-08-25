export function PhotoUpload({ label = "Upload Photos", multiple = true, onAdd }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className="block w-full text-sm text-gray-700 bg-white file:bg-[#F9FAFB] file:border file:border-gray-300 file:rounded file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#111827] hover:file:bg-gray-100 focus:outline-none"
        onChange={async (e) => {
          const files = Array.from(e.target.files || [])
          const toBase64 = (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.readAsDataURL(file)
              reader.onload = () => resolve(reader.result)
              reader.onerror = reject
            })

          const base64s = await Promise.all(files.map(toBase64))
          if (onAdd) onAdd(base64s)
          try { e.target.value = "" } catch {}
        }}
      />
    </div>
  )
}

