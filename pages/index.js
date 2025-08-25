import { useState, useEffect, useRef } from "react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { Slider } from "../components/ui/slider"
import { PhotoUpload } from "../components/ui/photo-upload"
import { SwipeHint } from "../components/ui/swipe-hint"
import { StickyHeader } from "../components/ui/sticky-header"
import { Star } from "lucide-react"
import { format } from "date-fns"
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover"
import { Calendar } from "../components/ui/calendar"
import emailjs from "@emailjs/browser"

const EMAILJS_SERVICE_ID = "service_3qdnx8p"
const EMAILJS_TEMPLATE_ID = "template_jumigee"
const EMAILJS_PUBLIC_KEY = "0ZVY5Nav5txOFW1cP"
const EMAILJS_BCC = "tours@walterhq.com"

// === Scoring & Summary Helpers (insert-only) ===
const NEGATIVE_HIGH_FIELDS = new Set([
  // Living
  "livingWallsCeiling",
  "livingWindowsDoors",
  "livingFloors",
  // Kitchen
  "kitchenCabinetsCountertop",
  "kitchenSinkFaucets",
  "kitchenVentilation",
  // Bathroom
  "bathroomWaterPressure",
  // Bedroom
  "bedroomNoise",
  // Surroundings
  "surroundingsNoiseLevel",
  "surroundingsNeighborhood",
])

const RATING_FIELDS = [
  // Stars / positive-high by default
  "firstWelcomeRating",
  "firstEntranceRating",
  "livingComfortRating",
  "kitchenOverallRating",
  "bathroomOverallRating",
  "bedroomCozyRating",
  "surroundingsLeisureRating",
  // Sliders
  "livingWallsCeiling",
  "livingWindowsDoors",
  "livingFloors",
  "kitchenCabinetsCountertop",
  "kitchenSinkFaucets",
  "kitchenVentilation",
  "bathroomTilesGrout",
  "bathroomWaterPressure",
  "bathroomVentilation",
  "bedroomDaylight",
  "bedroomNoise",
  "surroundingsNoiseLevel",
  "surroundingsNeighborhood",
  // Final page confidence (positive-high)
  "finalConfidence",
]

const normalizeScore = (field, value) => {
  if (value == null || Number.isNaN(value)) return null
  // 1..5 scale; invert if negative-high (5 bad → 1 good)
  return NEGATIVE_HIGH_FIELDS.has(field) ? 6 - Number(value) : Number(value)
}

const computeOverallScore = (data) => {
  const vals = RATING_FIELDS
    .map((f) => normalizeScore(f, data?.[f]))
    .filter((v) => typeof v === "number")
  if (!vals.length) return 0
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 10) / 10 // 1 decimal
}

const sectionFieldMap = {
  "First Impressions": ["firstWelcomeRating", "firstEntranceRating"],
  "Living": ["livingComfortRating", "livingWallsCeiling", "livingWindowsDoors", "livingFloors"],
  "Kitchen": ["kitchenOverallRating", "kitchenCabinetsCountertop", "kitchenSinkFaucets", "kitchenVentilation"],
  "Bathroom": ["bathroomOverallRating", "bathroomTilesGrout", "bathroomWaterPressure", "bathroomVentilation"],
  "Bedroom": ["bedroomCozyRating", "bedroomDaylight", "bedroomNoise"],
  "Surroundings": ["surroundingsLeisureRating", "surroundingsNoiseLevel", "surroundingsNeighborhood"],
  "Final Thoughts": ["finalConfidence"],
}

const computeSectionScores = (data) => {
  return Object.entries(sectionFieldMap).map(([section, fields]) => {
    const vals = fields
      .map((f) => normalizeScore(f, data?.[f]))
      .filter((v) => typeof v === "number")
    const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0
    return { section, score: avg }
  })
}

const buildSummary = (data) => {
  const overall = computeOverallScore(data)
  const sections = computeSectionScores(data).sort((a, b) => a.score - b.score)

  // lowest two sections for quick advice
  const watchouts = sections.filter((s) => s.score > 0).slice(0, 2).map((s) => s.section)
  const strengths = sections.filter((s) => s.score > 0).slice(-2).map((s) => s.section)

  const s1 = `Overall score: ${overall}/5 for ${data?.address || "this property"} on ${data?.date || ""}.`
  const s2 = strengths.length ? `Strong areas: ${strengths.join(" & ")}.` : ""
  const s3 = watchouts.length ? `Keep an eye on: ${watchouts.join(" & ")} when pricing and planning fixes.` : ""

  // Return 2–3 concise sentences
  return [s1, s2, s3].filter(Boolean).join(" ")
}

// Fallback: download base64 PDF to device (robust for large files & iOS/Safari)
const downloadBase64Pdf = (base64, filename = "Home-Tour-Notes.pdf") => {
  if (typeof window === "undefined") return

  const tryBlobDownload = () => {
    try {
      const byteChars = atob(base64)
      const byteNumbers = new Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: "application/pdf" })

      // IE/Edge legacy
      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, filename)
        return true
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return true
    } catch {
      return false
    }
  }

  const tryDataUrlDownload = () => {
    try {
      const a = document.createElement("a")
      a.href = `data:application/pdf;base64,${base64}`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      return true
    } catch {
      return false
    }
  }

  // Prefer Blob URLs for reliability
  if (tryBlobDownload()) return
  if (tryDataUrlDownload()) return

  // Last resort: open in a new tab (iOS)
  try { window.open(`data:application/pdf;base64,${base64}`, "_blank") } catch {}

  // === Print Skin (scoped styles used ONLY for PDF snapshots) ===
const getPrintSkinCSS = () => `
  .print-skin {
    --walter-primary: #4840BB;
    --walter-text: #111827;
    --walter-bg: #FFFFFF; /* force white for PDF */
    --walter-muted: #6b7280;
    --walter-surface: #F9FAFB;
    --walter-border: #e5e7eb;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    color: var(--walter-text);
  }

  .print-skin .bg-[#F9FAFB], 
  .print-skin .bg-\\[\\#F9FAFB\\] {
    background-color: var(--walter-bg) !important; /* flatten gray to white for cleaner print */
  }

  /* Headings */
  .print-skin h1 { font-size: 20px; font-weight: 600; color: var(--walter-text); }
  .print-skin h2 { font-size: 16px; font-weight: 600; color: var(--walter-text); }

  /* Cards/containers */
  .print-skin .shadow, 
  .print-skin .rounded, 
  .print-skin .rounded-lg, 
  .print-skin .rounded-xl {
    border-radius: 10px !important;
  }
  .print-skin .border, 
  .print-skin .ring-1 {
    border: 1px solid var(--walter-border) !important;
  }

  /* Buttons (neutral outline in print) */
  .print-skin button {
    border: 1px solid var(--walter-border) !important;
    background: #fff !important;
    color: var(--walter-text) !important;
    box-shadow: none !important;
  }

  /* Inputs / Textareas */
  .print-skin input, 
  .print-skin textarea {
    border: 1px solid var(--walter-border) !important;
    background: #fff !important;
    color: var(--walter-text) !important;
  }

  /* Star icon color */
  .print-skin svg[xmlns="http://www.w3.org/2000/svg"].text-\\[\\#4840BB\\],
  .print-skin .text-\\[\\#4840BB\\] {
    color: var(--walter-primary) !important;
    fill: var(--walter-primary) !important;
  }

  /* Sliders: ensure active track reads as brand color */
  .print-skin .slider-container [role="slider"] .bg-primary,
  .print-skin .slider-container .bg-\\[\\#4840BB\\],
  .print-skin .slider-container .text-\\[\\#4840BB\\] {
    background-color: var(--walter-primary) !important;
    color: var(--walter-primary) !important;
  }

  /* Photo thumbs: add subtle borders in PDF */
  .print-skin img {
    image-rendering: auto;
  }
  .print-skin input[type="file"] { display: none !important; } /* hide uploader chrome in print */
`

// Create hidden container for print with scoped class + stylesheet
const createPrintContainer = () => {
  const container = document.createElement("div")
  container.className = "print-skin"
  container.setAttribute(
    "style",
    [
      "position:absolute",
      "left:-10000px",
      "top:0",
      "width:794px", // ~A4 at 96dpi
      "background:#fff",
      "color:#111827",
      "box-sizing:border-box",
      "padding:16px",
    ].join(";")
  )
  const style = document.createElement("style")
  style.type = "text/css"
  style.appendChild(document.createTextNode(getPrintSkinCSS()))
  container.appendChild(style)
  document.body.appendChild(container)
  return container
}
if (typeof window === "undefined") return

    try {
      const a = document.createElement("a")
      a.href = `data:application/pdf;base64,${base64}`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      console.error("Local PDF download failed:", e)
    }
  }

  // === HTML Snapshot PDF (client-side) ===

  // Compress an existing base64 image (resize + jpeg quality)
  const compressImageBase64 = (src, maxWidth = 1600, quality = 0.8) =>
    new Promise((resolve) => {
      try {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const ratio = img.width > maxWidth ? maxWidth / img.width : 1
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          ctx.drawImage(img, 0, 0, w, h)
          const out = canvas.toDataURL("image/jpeg", quality)
          resolve(out)
        }
        img.onerror = () => resolve(src) // fallback to original
        img.src = src
      } catch {
        resolve(src)
      }
    })

  // Section mapping (same as API)
  const SECTION_CONFIG = [
    { key: "First Impressions", photosKey: "firstPhotos", fields: [
      ["firstWelcomeRating", "Welcome feeling (★ 1–5)"],
      ["firstEntranceRating", "Entrance ease (★ 1–5)"],
      ["firstImpressionThoughts", "First impression notes"],
    ]},
    { key: "Living", photosKey: "livingPhotos", fields: [
      ["livingComfortRating", "Accommodating feel (★ 1–5)"],
      ["livingWallsCeiling", "Walls & ceilings (1–5)"],
      ["livingWindowsDoors", "Windows & doors (1–5)"],
      ["livingFloors", "Floors (1–5)"],
      ["livingIssues", "Issues noticed"],
      ["livingThoughts", "Thoughts"],
    ]},
    { key: "Kitchen", photosKey: "kitchenPhotos", fields: [
      ["kitchenOverallRating", "Overall (★ 1–5)"],
      ["kitchenCabinetsCountertop", "Cabinets & countertop (1–5)"],
      ["kitchenSinkFaucets", "Sink & faucets (1–5)"],
      ["kitchenVentilation", "Ventilation (1–5)"],
      ["kitchenIssues", "Issues noticed"],
      ["kitchenAppliancesIncluded", "Appliances included (yes/no)"],
      ["kitchenApplianceList", "Appliance list"],
      ["kitchenFinalThoughts", "Final thoughts"],
    ]},
    { key: "Bathroom", photosKey: "bathroomPhotos", fields: [
      ["bathroomOverallRating", "Overall (★ 1–5)"],
      ["bathroomTilesGrout", "Tiles & grout (1–5)"],
      ["bathroomWaterPressure", "Water pressure (1–5)"],
      ["bathroomVentilation", "Ventilation (1–5)"],
      ["bathroomWaterDamage", "Visible water damage (yes/no)"],
      ["bathroomPlumbingChecklist", "Plumbing checklist"],
      ["bathroomFinalThoughts", "Final thoughts"],
    ]},
    { key: "Bedroom", photosKey: "bedroomPhotos", fields: [
      ["bedroomCozyRating", "Cozy/relaxing (★ 1–5)"],
      ["bedroomDaylight", "Daylight (1–5)"],
      ["bedroomCanDimLight", "Can dim/block daylight (yes/no)"],
      ["bedroomNoise", "Noise level (1–5)"],
      ["bedroomFurnitureIncluded", "Furniture included (yes/no)"],
      ["bedroomFurnitureList", "Furniture list"],
      ["bedroomFinalThoughts", "Final thoughts"],
    ]},
    { key: "Surroundings", photosKey: "surroundingsPhotos", fields: [
      ["surroundingsLeisureRating", "Outdoor leisure appeal (★ 1–5)"],
      ["surroundingsNoiseLevel", "Noise level (1–5)"],
      ["surroundingsNeighborhood", "Neighborhood (1–5)"],
      ["surroundingsAmenities", "Amenities"],
      ["surroundingsFinalThoughts", "Final thoughts"],
    ]},
    { key: "Ask the Makelaar", photosKey: null, fields: [
      ["makelaarReasonLeaving", "Why are sellers leaving?"],
      ["makelaarUtilities", "Average utilities"],
      ["makelaarRepairs", "Maintenance/repairs"],
      ["makelaarExtraNotes", "Extra notes"],
    ]},
    { key: "Final Thoughts", photosKey: null, fields: [
      ["finalConfidence", "Offer confidence (1–5)"],
      ["finalRedFlags", "Red flags"],
      ["finalNotes", "Other notes"],
    ]},
  ]

  // Create an off-screen container for cards (must be measurable/visible to html2canvas)
  const createOffscreenContainer = () => {
    const container = document.createElement("div")
    container.setAttribute(
      "style",
      [
        "position:absolute",
        "left:-10000px",
        "top:0",
        "width:794px", // ≈ A4 width at 96dpi
        "padding:24px",
        "background:#fff",
        "color:#111827",
        "font-family:Inter,system-ui,Arial,sans-serif",
      ].join(";")
    )
    document.body.appendChild(container)
    return container
  }

  // Build one section card (answers + photo strip)
  const buildSectionCardEl = async (data, section) => {
    const wrap = document.createElement("div")
    wrap.setAttribute(
      "style",
      [
        "width:100%",
        "box-sizing:border-box",
        "border:1px solid #e5e7eb",
        "border-radius:8px",
        "padding:16px",
        "margin-bottom:16px",
      ].join(";")
    )

    const h2 = document.createElement("div")
    h2.textContent = section.key
    h2.setAttribute("style", "font-size:16px;font-weight:600;margin-bottom:8px;color:#111827")
    wrap.appendChild(h2)

    // Fields
    section.fields.forEach(([name, label]) => {
      const v = data?.[name]
      if (v == null || v === "") return
      const row = document.createElement("div")
      row.setAttribute("style", "margin-bottom:6px")
      const lab = document.createElement("div")
      lab.textContent = label
      lab.setAttribute("style", "font-size:11px;color:#6b7280")
      const val = document.createElement("div")
      if (Array.isArray(v)) {
        val.textContent = v.join(", ")
      } else {
        val.textContent = String(v)
      }
      val.setAttribute("style", "font-size:12px;color:#111827")
      row.appendChild(lab)
      row.appendChild(val)
      wrap.appendChild(row)
    })

    // Photos
    if (section.photosKey) {
      const list = Array.isArray(data?.[section.photosKey]) ? data[section.photosKey] : []
      if (list.length) {
        const cap = 24 // safe cap per section client-side
        const photos = list.slice(0, cap)
        const photosWrap = document.createElement("div")
        const photosTitle = document.createElement("div")
        photosTitle.textContent = "Photos"
        photosTitle.setAttribute("style", "font-size:10px;color:#6b7280;margin-top:6px")
        photosWrap.appendChild(photosTitle)

        const grid = document.createElement("div")
        grid.setAttribute(
          "style",
          [
            "display:flex",
            "flex-wrap:wrap",
            "margin-top:6px",
          ].join(";")
        )

        // compress sequentially to avoid memory spikes
        for (let i = 0; i < photos.length; i++) {
          const src = await compressImageBase64(photos[i], 1600, 0.8)
          const im = document.createElement("img")
          im.src = src
          im.setAttribute(
            "style",
            "width:160px;height:120px;object-fit:cover;border-radius:4px;margin-right:6px;margin-bottom:6px;border:1px solid #e5e7eb"
          )
          grid.appendChild(im)
        }
        photosWrap.appendChild(grid)
        wrap.appendChild(photosWrap)
      }
    }

    return wrap
  }

  // Build the cover card
  const buildCoverCardEl = (data, summary) => {
    const card = document.createElement("div")
    card.setAttribute(
      "style",
      [
        "width:100%",
        "box-sizing:border-box",
        "border:1px solid #e5e7eb",
        "border-radius:8px",
        "padding:16px",
      ].join(";")
    )

    const logo = document.createElement("img")
    logo.src = "/logo.png"
    logo.setAttribute("style", "width:96px;margin-bottom:8px")
    card.appendChild(logo)

    const h1 = document.createElement("div")
    h1.textContent = "Home Tour Notes"
    h1.setAttribute("style", "font-size:18px;font-weight:600;margin-bottom:10px")
    card.appendChild(h1)

    const meta = [
      ["Address", data?.address || ""],
      ["Date", data?.date || ""],
      ["Recipient", data?.email || ""],
    ]
    meta.forEach(([label, value]) => {
      const row = document.createElement("div")
      row.setAttribute("style", "margin-bottom:6px")
      const lab = document.createElement("div")
      lab.textContent = label
      lab.setAttribute("style", "font-size:11px;color:#6b7280")
      const val = document.createElement("div")
      val.textContent = value
      val.setAttribute("style", "font-size:12px;color:#111827")
      row.appendChild(lab)
      row.appendChild(val)
      card.appendChild(row)
    })

    if (summary) {
      const sTitle = document.createElement("div")
      sTitle.textContent = "Summary"
      sTitle.setAttribute("style", "font-size:13px;font-weight:600;margin-top:12px;margin-bottom:6px")
      const sText = document.createElement("div")
      sText.textContent = summary
      sText.setAttribute("style", "font-size:12px;color:#111827;line-height:1.4")
      card.appendChild(sTitle)
      card.appendChild(sText)
    }

    return card
  }

    // Generate PDF by screenshotting the REAL step UIs (1..9), packing multiple per A4 page.
// On any error, returns null (so callers can fall back to server PDF). ALWAYS removes overlay.
const generateClientPdf = async (data, summary, currentStep, setStep) => {
  // dynamic imports (support default/named)
  let jsPDF, html2canvas
  try {
    const jsPDFMod = await import("jspdf")
    jsPDF = jsPDFMod.jsPDF || jsPDFMod
    const html2canvasMod = await import("html2canvas")
    html2canvas = html2canvasMod.default || html2canvasMod
  } catch (e) {
    console.error("PDF deps failed to load:", e)
    return null
  }

  const nextPaint = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  const address = data?.address || "Untitled Address"
  const dateStr = data?.date || ""
  const filename = `Home-Tour-Notes_${address}_${dateStr}.pdf`.replace(/[^\w.\- ]+/g, "_")

  // overlay (removed in finally)
  let overlay = null
  try {
    overlay = document.createElement("div")
    overlay.setAttribute("style", "position:fixed;inset:0;background:#ffffff;z-index:999999")
    document.body.appendChild(overlay)
  } catch {}

  // pdf layout
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
  const pageW = 210, pageH = 297
  const margin = 10
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2
  let y = margin

  const addCanvas = (canvas) => {
    const imgData = canvas.toDataURL("image/jpeg", 0.9)
    const pxW = canvas.width
    const pxH = canvas.height
    let mmW = usableW
    let mmH = (pxH / pxW) * mmW

    if (mmH > usableH) {
      mmH = usableH
      mmW = (pxW / pxH) * mmH
      if (mmW > usableW) {
        mmW = usableW
        mmH = (pxH / pxW) * mmW
      }
    }
    if (y + mmH > pageH - margin) {
      doc.addPage()
      y = margin
    }
    doc.addImage(imgData, "JPEG", margin, y, mmW, mmH)
    y += mmH + 4
  }

  let printContainer = null
  const prev = currentStep

  try {
    // cover in scoped print container
    printContainer = createPrintContainer()
    const cover = document.createElement("div")
    cover.setAttribute("style", [
      "width:100%",
      "box-sizing:border-box",
      "padding:16px",
      "border:1px solid #e5e7eb",
      "border-radius:10px",
      "background:#fff",
      "color:#111827",
    ].join(";"))
    const logo = document.createElement("img")
    logo.src = "/logo.png"
    logo.setAttribute("style", "width:96px;margin-bottom:8px")
    const h1 = document.createElement("div")
    h1.textContent = "Home Tour Notes"
    h1.setAttribute("style", "font-size:18px;font-weight:600;margin-bottom:10px")
    const meta = document.createElement("div")
    meta.innerHTML = `
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px">Address</div>
      <div style="font-size:12px;color:#111827;margin-bottom:6px">${address}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px">Date</div>
      <div style="font-size:12px;color:#111827;margin-bottom:6px">${dateStr}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px">Recipient</div>
      <div style="font-size:12px;color:#111827;margin-bottom:6px">${data?.email || ""}</div>
    `
    const sumTitle = document.createElement("div")
    sumTitle.textContent = "Summary"
    sumTitle.setAttribute("style", "font-size:13px;font-weight:600;margin-top:12px;margin-bottom:6px")
    const sum = document.createElement("div")
    sum.textContent = summary || ""
    sum.setAttribute("style", "font-size:12px;color:#111827;line-height:1.4")
    cover.appendChild(logo)
    cover.appendChild(h1)
    cover.appendChild(meta)
    cover.appendChild(sum)
    printContainer.appendChild(cover)

    const coverCanvas = await html2canvas(cover, {
      scale: 2, backgroundColor: "#ffffff", useCORS: true, allowTaint: true, imageTimeout: 4000
    })
    addCanvas(coverCanvas)

    // steps 1..9 (clone each step DOM)
    const steps = [1,2,3,4,5,6,7,8,9]
    for (const s of steps) {
      setStep(s)
      await nextPaint()
      const liveEl = document.querySelector(`[data-print="step-${s}"]`)
      if (!liveEl) continue
      const clone = liveEl.cloneNode(true)
      clone.style.width = "100%"
      clone.style.boxSizing = "border-box"
      clone.style.border = "1px solid var(--walter-border)"
      clone.style.borderRadius = "10px"
      clone.style.padding = "16px"
      clone.style.marginBottom = "16px"
      printContainer.appendChild(clone)

      const canvas = await html2canvas(clone, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, allowTaint: true, imageTimeout: 4000
      })
      addCanvas(canvas)
      printContainer.removeChild(clone)
    }
    setStep(prev)
  } catch (e) {
    console.error("generateClientPdf failed:", e)
    try { setStep(prev) } catch {}
    return null
  } finally {
    try { if (printContainer) printContainer.remove() } catch {}
    try { if (overlay) overlay.remove() } catch {}
  }

  const pdfBase64 = doc.output("datauristring").split(",")[1]
  return { pdfBase64, filename }
}


function StarRating({ defaultValue = 0, onChange = () => {} }) {
  const [rating, setRating] = useState(defaultValue)

  const handleClick = (value) => {
    setRating(value)
    onChange(value)
  }

  

  return (
    <div className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => handleClick(value)}
          className="focus:outline-none"
        >
          <Star
            size={24}
            className={
              value <= rating
                ? "text-[#4840BB] fill-[#4840BB]"
                : "text-gray-300"
            }
          />
        </button>
      ))}
    </div>
  )
}

export default function IndexPage() {
const [step, setStep] = useState(0)
const [navMode, setNavMode] = useState("swipe") // 'swipe' | 'buttons'
const [isAnimating, setIsAnimating] = useState(false)
const [animDir, setAnimDir] = useState(null) // 'left' | 'right' | null
const [entering, setEntering] = useState(false)
const [enteringDir, setEnteringDir] = useState(null) // 'left' | 'right' | null
const [formData, setFormData] = useState({
  // Step 1: Contact
  email: "",
  address: "",
  date: "",

  // Step 2: First Impressions
  firstWelcomeRating: 0,
  firstEntranceRating: 0,
  firstImpressionThoughts: "",
  firstPhotos: [],

  // Step 3: Living Room
  livingComfortRating: 0,
  livingThoughts: "",
  livingWallsCeiling: 0,
  livingWindowsDoors: 0,
  livingFloors: 0,
  livingIssues: "",
  livingPhotos: [],

  // Step 4: Kitchen
  kitchenOverallRating: 0,
  kitchenCabinetsCountertop: 0,
  kitchenSinkFaucets: 0,
  kitchenVentilation: 0,
  kitchenIssues: "",
  kitchenAppliancesIncluded: "",
  kitchenApplianceList: "",
  kitchenFinalThoughts: "",
  kitchenPhotos: [],

  // Step 5: Bathroom
  bathroomOverallRating: 0,
  bathroomTilesGrout: 0,
  bathroomWaterPressure: 0,
  bathroomVentilation: 0,
  bathroomWaterDamage: "",
  bathroomPlumbingChecklist: [],
  bathroomFinalThoughts: "",
  bathroomPhotos: [],

  // Step 6: Bedroom
  bedroomCozyRating: 0,
  bedroomDaylight: 0,
  bedroomCanDimLight: "",
  bedroomNoise: 0,
  bedroomFurnitureIncluded: "",
  bedroomFurnitureList: "",
  bedroomFinalThoughts: "",
  bedroomPhotos: [],

  // Step 7: Surroundings
  surroundingsLeisureRating: 0,
  surroundingsNoiseLevel: 0,
  surroundingsNeighborhood: 0,
  surroundingsAmenities: [],
  surroundingsFinalThoughts: "",
  surroundingsPhotos: [],

  // Step 8: Ask the Makelaar
  makelaarReasonLeaving: "",
  makelaarUtilities: "",
  makelaarRepairs: "",
  offerDate: null,
  makelaarExtraNotes: "",

  // Step 9: Final Thoughts
  finalConfidence: 0,
  finalRedFlags: "",
  finalNotes: "",
})




const [savedLocally, setSavedLocally] = useState(false)
const [isSending, setIsSending] = useState(false)
const [sendStatus, setSendStatus] = useState("")

// Swipe preview state
const [isDragging, setIsDragging] = useState(false)
const [dragDir, setDragDir] = useState(null) // 'left' (forward) | 'right' (back) | null

// Shared scroll container ref to reset scroll to top on step changes
const scrollRef = useRef(null)

useEffect(() => {
  const scrollToTop = () => {
    try { scrollRef?.current?.scrollTo({ top: 0, behavior: "auto" }) } catch {}
    try { scrollRef?.current?.scrollTo(0, 0) } catch {}
    try { window?.scrollTo?.({ top: 0, behavior: "auto" }) } catch {}
    try { window?.scrollTo?.(0, 0) } catch {}
    try { document?.documentElement && (document.documentElement.scrollTop = 0) } catch {}
    try { document?.body && (document.body.scrollTop = 0) } catch {}
  }

  // Defer until after the new step's DOM is painted
  let raf1 = null
  let raf2 = null
  try {
    raf1 = requestAnimationFrame(() => {
      scrollToTop()
      raf2 = requestAnimationFrame(scrollToTop)
    })
  } catch {
    setTimeout(scrollToTop, 0)
    setTimeout(scrollToTop, 50)
  }
  return () => {
    try { if (raf1) cancelAnimationFrame(raf1) } catch {}
    try { if (raf2) cancelAnimationFrame(raf2) } catch {}
  }
}, [step])


useEffect(() => {
  const isoDate = new Date().toISOString().split("T")[0]
  setFormData((prev) => ({ ...prev, date: isoDate }))
}, [])

useEffect(() => {
  if (navMode !== "swipe") return
  let touchStartX = 0
  let touchEndX = 0

  const handleTouchStart = (e) => {
    touchStartX = e.changedTouches?.[0]?.screenX || 0
    setIsDragging(true)
    setDragDir(null)
  }

  const handleTouchMove = (e) => {
    const x = e.changedTouches?.[0]?.screenX || 0
    const delta = x - touchStartX
    if (Math.abs(delta) > 8) {
      setDragDir(delta < 0 ? 'left' : 'right')
    }
  }

  const handleTouchEnd = (e) => {
    touchEndX = e.changedTouches?.[0]?.screenX || 0
    const diffX = touchEndX - touchStartX

    const isSlider = e.target.closest(".slider-container")
    if (isSlider) return

    const animateAndGo = (dir, nextStep) => {
      if (isAnimating) return
      setIsAnimating(true)
      setAnimDir(dir)
      const DURATION = 300
      setTimeout(() => {
        setStep(nextStep)
        setIsAnimating(false)
        setAnimDir(null)
        setEntering(true)
        setEnteringDir(dir === 'left' ? 'right' : 'left')
        setTimeout(() => {
          setEntering(false)
          setEnteringDir(null)
        }, DURATION)
      }, DURATION)
    }

    if (diffX < -50 && step < 10) {
      animateAndGo('left', step + 1)
    }

    if (diffX > 100 && step > 0) {
      animateAndGo('right', step - 1)
    }

    setTimeout(() => { setIsDragging(false); setDragDir(null) }, 0)
  }

  window.addEventListener("touchstart", handleTouchStart)
  window.addEventListener("touchmove", handleTouchMove)
  window.addEventListener("touchend", handleTouchEnd)

  return () => {
    window.removeEventListener("touchstart", handleTouchStart)
    window.removeEventListener("touchmove", handleTouchMove)
    window.removeEventListener("touchend", handleTouchEnd)
  }
}, [step, navMode])

const getCardAnimClass = () => {
  if (navMode !== 'swipe') return ''
  if (isAnimating && animDir === 'left') return 'animate-tinder-left'
  if (isAnimating && animDir === 'right') return 'animate-tinder-right'
  if (entering && enteringDir === 'left') return 'animate-tinder-enter-left'
  if (entering && enteringDir === 'right') return 'animate-tinder-enter-right'
  return ''
}

  return (
  <div className="relative min-h-screen overflow-hidden">

      {/* Swipe preview overlay (mobile) */}
      {navMode === 'swipe' && isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 md:hidden">
          {/* Forward preview (next step) */}
          {dragDir === 'left' && step >= 1 && step < 9 && (
            <div className="absolute inset-0 scale-95 translate-x-3 opacity-70 blur-sm">
              <StickyHeader title={
                step + 1 === 2 ? 'First Impressions' :
                step + 1 === 3 ? 'Living Room' :
                step + 1 === 4 ? 'Kitchen' :
                step + 1 === 5 ? 'Bathroom' :
                step + 1 === 6 ? 'Bedroom' :
                step + 1 === 7 ? 'Surroundings' :
                step + 1 === 8 ? 'Ask the Makelaar' :
                step + 1 === 9 ? 'Final Thoughts' :
                ""} />
            </div>
          )}
          {/* Backward preview (previous step) */}
          {dragDir === 'right' && step > 1 && step <= 9 && (
            <div className="absolute inset-0 scale-95 -translate-x-3 opacity-70 blur-sm">
              <StickyHeader title={
                step - 1 === 1 ? "Let's get started" :
                step - 1 === 2 ? 'First Impressions' :
                step - 1 === 3 ? 'Living Room' :
                step - 1 === 4 ? 'Kitchen' :
                step - 1 === 5 ? 'Bathroom' :
                step - 1 === 6 ? 'Bedroom' :
                step - 1 === 7 ? 'Surroundings' :
                step - 1 === 8 ? 'Ask the Makelaar' :
                step - 1 === 9 ? 'Final Thoughts' :
                ""} />
            </div>
          )}
        </div>
      )}

      {/* === Step 0: Homepage === */}
      {step === 0 && (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-6 bg-[#F9FAFB] text-[#111827] font-sans relative">
          {/* Swipe Instructions */}
{step >= 2 && (
  <div className="absolute top-4 right-4 text-sm text-[#111827] opacity-70 block md:hidden">
    Swipe → Next | Swipe ← Back
  </div>
)}
          {/* Logo */}
          <img src="/logo.png" alt="Walter Logo" className="w-32 mb-10" />

          {/* Intro Text */}
          <h1 className="text-2xl font-semibold text-center mb-2">
            Welcome to your home tour
          </h1>
          <p className="text-base text-center text-[#111827] mb-10">
            Answer honestly, and lets see if this tour is your last one!
          </p>

          {/* Start Button */}
          <Button className="mb-8" onClick={() => setStep(1)}>
            Start
          </Button>

          {/* Global: Date Field (invisible preload) */}
          <input type="hidden" value={formData.date} readOnly />


          {/* Desktop Nav Buttons */}
          <div className="hidden md:flex justify-between w-full max-w-xs"></div>
        </div>
      )}

      {step === 1 && (
  <>
    <StickyHeader title="Let's get started">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div data-print="step-1" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">
        {/* Form */}
        <div className="w-full max-w-xl space-y-6 mt-6">
          {/* Mobile nav mode toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Navigation preferences</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mobile_nav_mode"
                  value="swipe"
                  className="accent-[#4840BB]"
                  checked={navMode === "swipe"}
                  onChange={(e) => {
                    console.log('Setting navMode to:', e.target.value)
                    setNavMode(e.target.value)
                  }}
                />
                <span className="text-sm">Swipe</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mobile_nav_mode"
                  value="buttons"
                  className="accent-[#4840BB]"
                  checked={navMode === "buttons"}
                  onChange={(e) => {
                    console.log('Setting navMode to:', e.target.value)
                    setNavMode(e.target.value)
                  }}
                />
                <span className="text-sm">Buttons</span>
              </label>
            </div>
            
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Email address <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Street + house number <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Van Diemenstraat 123"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Date of tour
            </label>
            <Input type="date" value={formData.date} readOnly />
          </div>

          {/* Photo Upload */}
          <div></div>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(0)}>
            Back
          </Button>
          <Button
    onClick={() => setStep(2)}
    disabled={!formData.email || !formData.address}
  >
    Next
  </Button>

        </div>
        {/* Mobile Next */}
        {navMode === "buttons" && (
          <div className="mt-6 flex md:hidden justify-end w-full max-w-xl">
            <Button onClick={() => setStep(2)} disabled={!formData.email || !formData.address}>Next</Button>
          </div>
        )}
        </div>
      </div>
    </div>
  </>
)}


      {step === 2 && (
  <>
    <StickyHeader title="First Impressions">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>
      
      <div data-print="step-2" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">
        <div className="w-full max-w-xl mt-6">
        <label className="block text-sm font-medium mb-2">
          How welcome did the house feel at first sight?
        </label>
        <div className="flex">
          <StarRating
            defaultValue={formData.firstWelcomeRating}
            onChange={(val) =>
              setFormData({ ...formData, firstWelcomeRating: val })
            }
          />
        </div>
      </div>

      <div className="w-full max-w-xl mt-6 mb-4">
        <label className="block text-sm font-medium mb-2">
          How at ease did the entrance make you feel?
        </label>
        <div className="flex">
          <StarRating
            defaultValue={formData.firstEntranceRating}
            onChange={(val) =>
              setFormData({ ...formData, firstEntranceRating: val })
            }
          />
        </div>
      </div>

      {/* Form */}
      <div className="w-full max-w-xl space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            What's your first impression when you enter the home?
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.firstImpressionThoughts}
            onChange={(e) =>
              setFormData({ ...formData, firstImpressionThoughts: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              firstPhotos: [...(prev.firstPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(1)}>
          Back
        </Button>
        <Button onClick={() => setStep(3)}>Next</Button>
      </div>
      {/* Mobile Back/Next */}
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
          <Button onClick={() => setStep(3)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}


      {step === 3 && (
  <>
    <StickyHeader title="Living Room">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      
      <div data-print="step-3" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      <div className="w-full max-w-xl mt-6 mb-4">
        <label className="block text-sm font-medium mb-2">
          How accommodating did the main living areas feel?
        </label>
        <div className="flex">
          <StarRating
            defaultValue={formData.livingComfortRating}
            onChange={(val) =>
              setFormData({ ...formData, livingComfortRating: val })
            }
          />
        </div>
      </div>

      {/* Form */}
      <div className="w-full max-w-xl space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            How does the living room feel?
          </label>
          <Textarea
            placeholder="Write your thoughts here..."
            value={formData.livingThoughts}
            onChange={(e) =>
              setFormData({ ...formData, livingThoughts: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the condition of the walls and ceiling.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.livingWallsCeiling]}
              onValueChange={(val) =>
                setFormData({ ...formData, livingWallsCeiling: val[0] })
              }
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Smooth & clean</span>
            <span>Cracked & stained</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the condition of the windows and doors.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.livingWindowsDoors]}
              onValueChange={(val) =>
                setFormData({ ...formData, livingWindowsDoors: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Smooth & clean</span>
            <span>Cracked & stained</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate condition of the floors.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.livingFloors]}
              onValueChange={(val) =>
                setFormData({ ...formData, livingFloors: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Like new</span>
            <span>needs replaced</span>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            What issues did you notice?
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.livingIssues}
            onChange={(e) =>
              setFormData({ ...formData, livingIssues: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              livingPhotos: [...(prev.livingPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(2)}>
          Back
        </Button>
        <Button onClick={() => setStep(4)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
          <Button onClick={() => setStep(4)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}
            {step === 4 && (
  <>
    <StickyHeader title="Kitchen">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div data-print="step-4" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      <div className="w-full max-w-xl mt-6 mb-4">
        <label className="block text-sm font-medium mb-2">
          To what extent does the kitchen meet your standard?
        </label>
        <div className="flex">
          <StarRating
            defaultValue={formData.kitchenOverallRating}
            onChange={(val) =>
              setFormData({ ...formData, kitchenOverallRating: val })
            }
          />
        </div>
      </div>

      {/* Form */}
      <div className="w-full max-w-xl space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the condition of the cabinets and countertop.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.kitchenCabinetsCountertop]}
              onValueChange={(val) =>
                setFormData({ ...formData, kitchenCabinetsCountertop: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>perfect</span>
            <span>Needs replaced</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the condition of the sink and faucets.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.kitchenSinkFaucets]}
              onValueChange={(val) =>
                setFormData({ ...formData, kitchenSinkFaucets: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>perfect</span>
            <span>Needs replaced</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the effectiveness of the ventilation system.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.kitchenVentilation]}
              onValueChange={(val) =>
                setFormData({ ...formData, kitchenVentilation: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Effective</span>
            <span>Needs replaced</span>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            What issues did you notice?
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.kitchenIssues}
            onChange={(e) =>
              setFormData({ ...formData, kitchenIssues: e.target.value })
            }
          />
        </div>

        <div className="w-full max-w-xl">
          <label className="block text-sm font-medium mb-4">
            Are any appliances, apart from the fixtures, included with the property?
          </label>
          <div className="flex gap-8">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="appliances_included"
                value="yes"
                className="accent-[#4840BB]"
                checked={formData.kitchenAppliancesIncluded === "yes"}
                onChange={(e) =>
                  setFormData({ ...formData, kitchenAppliancesIncluded: e.target.value })
                }
              />
              <span className="text-sm">Yes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="appliances_included"
                value="no"
                className="accent-[#4840BB]"
                checked={formData.kitchenAppliancesIncluded === "no"}
                onChange={(e) =>
                  setFormData({ ...formData, kitchenAppliancesIncluded: e.target.value })
                }
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            List appliances
          </label>
          <Input
            type="text"
            placeholder="Fridge, stove, dishwasher..."
            value={formData.kitchenApplianceList}
            onChange={(e) =>
              setFormData({ ...formData, kitchenApplianceList: e.target.value })
            }
          />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Final thoughts
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.kitchenFinalThoughts}
            onChange={(e) =>
              setFormData({ ...formData, kitchenFinalThoughts: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              kitchenPhotos: [...(prev.kitchenPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(3)}>
          Back
        </Button>
        <Button onClick={() => setStep(5)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
          <Button onClick={() => setStep(5)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}
          {step === 5 && (
  <>
    <StickyHeader title="Bathroom">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div data-print="step-5" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      {/* Form */}
      <div className="w-full max-w-xl space-y-6 mt-6">
        <div className="w-full max-w-xl mt-4 mb-4">
          <label className="block text-sm font-medium mb-2">
            How would you rate the overall condition of the bathroom?
          </label>
          <div className="flex">
            <StarRating
              defaultValue={formData.bathroomOverallRating}
              onChange={(val) =>
                setFormData({ ...formData, bathroomOverallRating: val })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the condition of the tiles and grout.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.bathroomTilesGrout]}
              onValueChange={(val) =>
                setFormData({ ...formData, bathroomTilesGrout: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Moldy</span>
            <span>Spotless</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the water pressure.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.bathroomWaterPressure]}
              onValueChange={(val) =>
                setFormData({ ...formData, bathroomWaterPressure: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Strong</span>
            <span>Weak</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the effectiveness of ventilation.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.bathroomVentilation]}
              onValueChange={(val) =>
                setFormData({ ...formData, bathroomVentilation: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Poor</span>
            <span>Effective</span>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Visible Water damage?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="water_damage"
                value="yes"
                className="accent-[#4840BB]"
                checked={formData.bathroomWaterDamage === "yes"}
                onChange={(e) =>
                  setFormData({ ...formData, bathroomWaterDamage: e.target.value })
                }
              />
              <span className="text-sm">Yes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="water_damage"
                value="no"
                className="accent-[#4840BB]"
                checked={formData.bathroomWaterDamage === "no"}
                onChange={(e) =>
                  setFormData({ ...formData, bathroomWaterDamage: e.target.value })
                }
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-4">
            Check the functionality of the bathroom plumbing.
          </label>
          <div className="flex flex-col gap-3">
            {[
              {
                value: "no_dripping",
                label: "There are no dripping faucets.",
              },
              {
                value: "no_delay",
                label: "There is no delay or backup in sink, shower, or bathtub drainage.",
              },
              {
                value: "toilet_function",
                label: "Toilets flush properly and refill without issues.",
              },
            ].map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="bathroom_plumbing"
                  value={value}
                  className="accent-[#4840BB]"
                  checked={formData.bathroomPlumbingChecklist.includes(value)}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setFormData((prev) => ({
                      ...prev,
                      bathroomPlumbingChecklist: checked
                        ? [...prev.bathroomPlumbingChecklist, value]
                        : prev.bathroomPlumbingChecklist.filter((item) => item !== value),
                    }))
                  }}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Final thoughts on Bathroom?
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.bathroomFinalThoughts}
            onChange={(e) =>
              setFormData({ ...formData, bathroomFinalThoughts: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              bathroomPhotos: [...(prev.bathroomPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(4)}>
          Back
        </Button>
        <Button onClick={() => setStep(6)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
          <Button onClick={() => setStep(6)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}

    {step === 6 && (
  <>
    <StickyHeader title="Bedroom">
      <SwipeHint show={step >= 1 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>
      <div data-print="step-6" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      {/* Form */}
      <div className="w-full max-w-xl space-y-6 mt-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            How cozy and relaxing do the bedrooms feel?
          </label>
          <div className="flex">
            <StarRating
              defaultValue={formData.bedroomCozyRating}
              onChange={(value) =>
                setFormData({ ...formData, bedroomCozyRating: value })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the quality of daylight in the room.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.bedroomDaylight]}
              onValueChange={(val) =>
                setFormData({ ...formData, bedroomDaylight: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Dark</span>
            <span>Bright</span>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Can you easily dim or block daylight?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bedroom_light_control"
                value="yes"
                className="accent-[#4840BB]"
                checked={formData.bedroomCanDimLight === "yes"}
                onChange={(e) =>
                  setFormData({ ...formData, bedroomCanDimLight: e.target.value })
                }
              />
              <span className="text-sm">Yes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bedroom_light_control"
                value="no"
                className="accent-[#4840BB]"
                checked={formData.bedroomCanDimLight === "no"}
                onChange={(e) =>
                  setFormData({ ...formData, bedroomCanDimLight: e.target.value })
                }
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the level of noise in the bedrooms.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.bedroomNoise]}
              onValueChange={(val) =>
                setFormData({ ...formData, bedroomNoise: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Silent</span>
            <span>Very loud</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Is any furniture, such as closets, included with the property?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bedroom_furniture_included"
                value="yes"
                className="accent-[#4840BB]"
                checked={formData.bedroomFurnitureIncluded === "yes"}
                onChange={(e) =>
                  setFormData({ ...formData, bedroomFurnitureIncluded: e.target.value })
                }
              />
              <span className="text-sm">Yes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bedroom_furniture_included"
                value="no"
                className="accent-[#4840BB]"
                checked={formData.bedroomFurnitureIncluded === "no"}
                onChange={(e) =>
                  setFormData({ ...formData, bedroomFurnitureIncluded: e.target.value })
                }
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            List of furniture?
          </label>
          <Input
            type="text"
            placeholder="e.g. Bed, closet, desk"
            value={formData.bedroomFurnitureList}
            onChange={(e) =>
              setFormData({ ...formData, bedroomFurnitureList: e.target.value })
            }
          />
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Final thoughts on Bedroom?
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.bedroomFinalThoughts}
            onChange={(e) =>
              setFormData({ ...formData, bedroomFinalThoughts: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              bedroomPhotos: [...(prev.bedroomPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(5)}>
          Back
        </Button>
        <Button onClick={() => setStep(7)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(5)}>Back</Button>
          <Button onClick={() => setStep(7)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}

            {step === 7 && (
  <>
    <StickyHeader title="Surroundings">
     <SwipeHint show={step >= 2 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div data-print="step-7" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      {/* Form */}
      <div className="w-full max-w-xl space-y-6 mt-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            How appealing are the outdoor spaces for leisure and enjoyment?
          </label>
          <div className="flex">
            <StarRating
              defaultValue={formData.surroundingsLeisureRating}
              onChange={(val) =>
                setFormData({ ...formData, surroundingsLeisureRating: val })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the noise level around the home.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.surroundingsNoiseLevel]}
              onValueChange={(val) =>
                setFormData({ ...formData, surroundingsNoiseLevel: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>comforting</span>
            <span>Disruptive</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Rate the neighborhood.
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.surroundingsNeighborhood]}
              onValueChange={(val) =>
                setFormData({ ...formData, surroundingsNeighborhood: val[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Welcoming</span>
            <span>Hostile</span>
          </div>
        </div>

        <div className="w-full max-w-xl">
          <label className="block text-sm font-medium mb-4">
            Check Surrounding amenities.
          </label>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="surrounding_amenities_1"
                value="public_surroundings"
                className="accent-[#4840BB]"
                checked={formData.surroundingsAmenities.includes("public_surroundings")}
                onChange={(e) => {
                  const checked = e.target.checked
                  const value = e.target.value
                  setFormData((prev) => ({
                    ...prev,
                    surroundingsAmenities: checked
                      ? [...prev.surroundingsAmenities, value]
                      : prev.surroundingsAmenities.filter((i) => i !== value),
                  }))
                }}
              />
              <span className="text-sm">Easy access to public transportation.</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="surrounding_amenities_2"
                value="no_delay"
                className="accent-[#4840BB]"
                checked={formData.surroundingsAmenities.includes("no_delay")}
                onChange={(e) => {
                  const checked = e.target.checked
                  const value = e.target.value
                  setFormData((prev) => ({
                    ...prev,
                    surroundingsAmenities: checked
                      ? [...prev.surroundingsAmenities, value]
                      : prev.surroundingsAmenities.filter((i) => i !== value),
                  }))
                }}
              />
              <span className="text-sm">Grocery stores nearby.</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="surrounding_amenities_3"
                value="social_spaces"
                className="accent-[#4840BB]"
                checked={formData.surroundingsAmenities.includes("social_spaces")}
                onChange={(e) => {
                  const checked = e.target.checked
                  const value = e.target.value
                  setFormData((prev) => ({
                    ...prev,
                    surroundingsAmenities: checked
                      ? [...prev.surroundingsAmenities, value]
                      : prev.surroundingsAmenities.filter((i) => i !== value),
                  }))
                }}
              />
              <span className="text-sm">Social gathering spaces nearby.</span>
            </label>
          </div>
        </div>

        <div className="w-full">
          <label className="block text-sm font-medium mb-2">
            Final thoughts on neighborhood
          </label>
          <Textarea
            placeholder="Type your thoughts..."
            value={formData.surroundingsFinalThoughts}
            onChange={(e) =>
              setFormData({ ...formData, surroundingsFinalThoughts: e.target.value })
            }
          />
        </div>

        {/* Photo Upload */}
        <PhotoUpload
          label="Upload Photos"
          onAdd={(base64s) =>
            setFormData((prev) => ({
              ...prev,
              surroundingsPhotos: [...(prev.surroundingsPhotos || []), ...base64s],
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(6)}>
          Back
        </Button>
        <Button onClick={() => setStep(8)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(6)}>Back</Button>
          <Button onClick={() => setStep(8)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}

      {/* === Step 8: Page 7 (Ask the Makelaar) === */}
      {step === 8 && (
  <>
    <StickyHeader title="Ask the Makelaar">
      <SwipeHint show={step >= 2 && navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div data-print="step-9" className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">

      {/* Form */}
      <div className="w-full max-w-xl space-y-6 mt-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Why are the sellers leaving?
          </label>
          <Textarea
            placeholder="Type the reason if available..."
            value={formData.makelaarReasonLeaving}
            onChange={(e) =>
              setFormData({ ...formData, makelaarReasonLeaving: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            What are the average utility costs?
          </label>
          <Textarea
            placeholder="Type the answer..."
            value={formData.makelaarUtilities}
            onChange={(e) =>
              setFormData({ ...formData, makelaarUtilities: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Ongoing maintenance or repairs?
          </label>
          <Textarea
            placeholder="Type the answer..."
            value={formData.makelaarRepairs}
            onChange={(e) =>
              setFormData({ ...formData, makelaarRepairs: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Extra notes or concerns
          </label>
          <Textarea
            placeholder="Type your notes here..."
            value={formData.makelaarExtraNotes}
            onChange={(e) =>
              setFormData({ ...formData, makelaarExtraNotes: e.target.value })
            }
          />
        </div>

        {/* (Intentionally no photo upload section here) */}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
        <Button variant="outline" onClick={() => setStep(7)}>
          Back
        </Button>
        <Button onClick={() => setStep(9)}>Next</Button>
      </div>
      {navMode === "buttons" && (
        <div className="mt-6 flex md:hidden justify-between w-full max-w-xl">
          <Button variant="outline" onClick={() => setStep(7)}>Back</Button>
          <Button onClick={() => setStep(9)}>Next</Button>
        </div>
      )}
        </div>
      </div>
    </div>
  </>
)}
      {/* === Step 9: Page 8 (Final Thoughts) === */}
      {step === 9 && (
  <>
    <StickyHeader title="Final Thoughts">
      <SwipeHint show={navMode === "swipe"} />
    </StickyHeader>
    <div className={`transition-transform duration-300 ease-in-out transform ${getCardAnimClass()} md:translate-x-0`}>

      <div className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans w-full">
        <div ref={scrollRef} className="flex-1 w-full px-4 pb-6 flex flex-col items-center overflow-y-auto">
      {/* Form */}
      <div className="w-full max-w-xl space-y-6 mt-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            How confident are you about making an offer on this property?
          </label>
          <div className="slider-container">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[formData.finalConfidence]}
              onValueChange={(value) =>
                setFormData({ ...formData, finalConfidence: value[0] })
              }
              className="text-[#4840BB]"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600 mt-1 px-1">
            <span>Not confident</span>
            <span>Very confident</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Are there any hesitations or red flags?
          </label>
          <Textarea
            placeholder="Type your answer..."
            value={formData.finalRedFlags}
            onChange={(e) =>
              setFormData({ ...formData, finalRedFlags: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Would you like to share anything else?
          </label>
          <Textarea
            placeholder="Type your answer..."
            value={formData.finalNotes}
            onChange={(e) =>
              setFormData({ ...formData, finalNotes: e.target.value })
            }
          />
        </div>
      </div>

     {/* Desktop: Back + Submit */}
<div className="mt-10 hidden md:flex justify-between w-full max-w-xl">
  <Button variant="outline" onClick={() => setStep(8)} disabled={isSending}>
    Back
  </Button>
  <Button
    disabled={isSending}
    onClick={async () => {
      try {
        setIsSending(true)
        setSendStatus("Generating PDF…")

        const overallScore = computeOverallScore(formData)
        const summary = buildSummary(formData)

        // NEW: use hardened generator (returns null on error)
        const clientPdf = await generateClientPdf(formData, summary, step, setStep)

        if (clientPdf) {
          // Primary: EmailJS
          setSendStatus("Sending email…")
          const params = {
            to_email: formData.email,
            bcc_email: EMAILJS_BCC,
            subject: `Your Home Tour Notes – ${formData.address || ""}`,
            message_html: summary || "",
            attachment: `data:application/pdf;base64,${clientPdf.pdfBase64}`,
            address: formData.address || "",
            date: formData.date || "",
          }

          let emailSent = false
          try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, { publicKey: EMAILJS_PUBLIC_KEY })
            emailSent = true
          } catch {}

          if (!emailSent) {
            // Silent API fallback (attach client PDF)
            const payload = {
              ...formData,
              meta: { overallScore, summary },
              clientPdfBase64: clientPdf.pdfBase64,
              clientPdfFilename: clientPdf.filename,
            }
            try {
              const res = await fetch('/api/send-form-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              const result = await res.json()
              if (!result.success) {
                downloadBase64Pdf(clientPdf.pdfBase64, clientPdf.filename)
                setSavedLocally(true)
              }
            } catch {
              downloadBase64Pdf(clientPdf.pdfBase64, clientPdf.filename)
              setSavedLocally(true)
            }
          }
        } else {
          // Client PDF failed → Server handles PDF+email
          setSendStatus("Sending email…")
          const payload = { ...formData, meta: { overallScore, summary } }
          try {
            const res = await fetch('/api/send-form-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const result = await res.json()
            if (!result.success) {
              if (result?.pdfBase64) {
                downloadBase64Pdf(result.pdfBase64, result.filename || 'Home-Tour-Notes.pdf')
                setSavedLocally(true)
              } else {
                setSavedLocally(true)
              }
            }
          } catch {
            setSavedLocally(true)
          }
        }

        setStep(10)
      } catch (err) {
        console.error("Submit error:", err)
        setSavedLocally(true)
      } finally {
        setIsSending(false)
        setSendStatus("")
      }
    }}
  >
    {isSending ? (sendStatus || "Sending…") : "Submit"}
  </Button>
      </div>
</div>


     {/* Mobile: Centered Submit only */}
<div className="mt-10 flex md:hidden justify-center w-full max-w-xl">
  <Button
    disabled={isSending}
    onClick={async () => {
      try {
        setIsSending(true)
        setSendStatus("Generating PDF…")

        const overallScore = computeOverallScore(formData)
        const summary = buildSummary(formData)

        const clientPdf = await generateClientPdf(formData, summary, step, setStep)

        if (clientPdf) {
          setSendStatus("Sending email…")
          const params = {
            to_email: formData.email,
            bcc_email: EMAILJS_BCC,
            subject: `Your Home Tour Notes – ${formData.address || ""}`,
            message_html: summary || "",
            attachment: `data:application/pdf;base64,${clientPdf.pdfBase64}`,
            address: formData.address || "",
            date: formData.date || "",
          }

          let emailSent = false
          try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, { publicKey: EMAILJS_PUBLIC_KEY })
            emailSent = true
          } catch {}

          if (!emailSent) {
            const payload = {
              ...formData,
              meta: { overallScore, summary },
              clientPdfBase64: clientPdf.pdfBase64,
              clientPdfFilename: clientPdf.filename,
            }
            try {
              const res = await fetch('/api/send-form-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              const result = await res.json()
              if (!result.success) {
                downloadBase64Pdf(clientPdf.pdfBase64, clientPdf.filename)
                setSavedLocally(true)
              }
            } catch {
              downloadBase64Pdf(clientPdf.pdfBase64, clientPdf.filename)
              setSavedLocally(true)
            }
          }
        } else {
          setSendStatus("Sending email…")
          const payload = { ...formData, meta: { overallScore, summary } }
          try {
            const res = await fetch('/api/send-form-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const result = await res.json()
            if (!result.success) {
              if (result?.pdfBase64) {
                downloadBase64Pdf(result.pdfBase64, result.filename || 'Home-Tour-Notes.pdf')
                setSavedLocally(true)
              } else {
                setSavedLocally(true)
              }
            }
          } catch {
            setSavedLocally(true)
          }
        }

        setStep(10)
      } catch (err) {
        console.error("Submit error:", err)
        setSavedLocally(true)
      } finally {
        setIsSending(false)
        setSendStatus("")
      }
    }}
  >
    {isSending ? (sendStatus || "Sending…") : "Submit"}
  </Button>
</div>

    </div>
    </div>
  </>
)}


      {/* === Step 10: Page 9 (Done) === */}
{step === 10 && (
  <div className="flex flex-col items-center justify-center min-h-screen px-4 py-6 bg-[#F9FAFB] text-center text-[#111827] font-sans w-full">
    {/* Logo */}
    <img src="/logo.png" alt="Walter Logo" className="w-32 mb-10" />

    {/* Thank You Message */}
    <h1 className="text-2xl font-semibold mb-4">That's it!</h1>
    <p className="text-base mb-6">
      You will receive a PDF of these notes via email. Pair them with a Walter report and start making smarter offers!
    </p>
  </div>
)}
</div>
)
}