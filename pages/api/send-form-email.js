// pages/api/send-form-email.js
// Sends the form email via Resend with a generated PDF attachment.
// Depends on: npm i @react-pdf/renderer resend
import { Resend } from "resend"
import { pdf, Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer"
import path from "path"
import fs from "fs"

// ---- Config ----
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM || "Justin@walterhq.com"
const BCCS = ["tour@Walterhq.com", "26642713@bcc.eu1.hubspot.com"].filter(Boolean)


// ---- Fonts / Styles for PDF ----
// Inter is not embedded; fallback to standard font for reliability in serverless.
const styles = StyleSheet.create({
  // A4-friendly padding with a bit more breathing room
  page: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 24, fontSize: 11 },
  header: { marginBottom: 20 },
  logo: { width: 96, marginBottom: 8 },
  h1: { fontSize: 16, marginBottom: 10 },
  h2: { fontSize: 13, marginTop: 12, marginBottom: 8 },
  metaRow: { marginBottom: 4 },
  metaLabel: { fontSize: 10, color: "#6b7280" },
  metaValue: { fontSize: 11 },
  text: { fontSize: 11, lineHeight: 1.4 },
  section: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb" },

  // Remove unsupported "gap"; rely on per-child margins so wrap works consistently
  row: { display: "flex", flexDirection: "row", flexWrap: "wrap" },
  pill: { backgroundColor: "#f3f4f6", paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, marginRight: 6, marginBottom: 6 },
  pillText: { fontSize: 10 },

  photoGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  // 3-up grid on A4 with margins; wraps cleanly
  photo: { width: 160, height: 120, objectFit: "cover", borderRadius: 4, marginRight: 6, marginBottom: 6 },

  small: { fontSize: 9, color: "#6b7280" },
})

// ---- Load logo from /public/logo.png ----
const readLogoDataUri = () => {
  try {
    const p = path.join(process.cwd(), "public", "logo.png")
    const buf = fs.readFileSync(p)
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

// ---- Section config (order fixed per Phase 0) ----
const SECTIONS = [
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

// ---- PDF Component ----
const PdfDoc = ({ data, summary, logoDataUri }) => {
  const address = data?.address || ""
  const date = data?.date || ""
  const recipient = data?.email || ""
  const overallScore = data?.meta?.overallScore ?? ""

  const renderField = (name, label) => {
    const v = data?.[name]
    if (v == null) return null

    if (Array.isArray(v)) {
      if (name === "bathroomPlumbingChecklist" || name === "surroundingsAmenities") {
        return (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{label}</Text>
            <View style={styles.row}>
              {v.map((item, idx) => (
                <View style={styles.pill} key={`${name}-${idx}`}>
                  <Text style={styles.pillText}>{String(item)}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      }
      // For photos arrays we handle elsewhere.
      return (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{label}</Text>
          <Text style={styles.text}>{v.join(", ")}</Text>
        </View>
      )
    }

    // Strings / numbers / yes-no
    return (
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.text}>{String(v)}</Text>
      </View>
    )
  }

  // Photo helpers: chunk into pages to cap per-section pages
const PHOTOS_PER_ROW = 3
const ROWS_PER_PAGE = 4
const MAX_PHOTOS_PER_PAGE = PHOTOS_PER_ROW * ROWS_PER_PAGE // 12
const MAX_PAGES_PER_SECTION = 2 // 1st page (fields + photos), plus 1 extra photos-only page

const chunkPhotos = (arr = [], size = MAX_PHOTOS_PER_PAGE) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

  const renderPhotoStrip = (photosKey) => {
    if (!photosKey) return null
    const list = Array.isArray(data?.[photosKey]) ? data[photosKey] : []
    if (!list.length) return null

    const photos = list.slice(0, MAX_PHOTOS_PER_PAGE)
    return (
      <View style={[styles.section, { marginTop: 8 }]}> 
        <Text style={styles.metaLabel}>Photos</Text>
        <View style={styles.photoGrid}>
          {photos.map((src, idx) => (
            <Image key={`${photosKey}-${idx}`} style={styles.photo} src={src} />
          ))}
        </View>
      </View>
    )
  }


  const logo = logoDataUri

  return (
    <Document>
      {/* ---- Cover Page ---- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <Text style={styles.h1}>Home Tour Notes</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Address</Text>
            <Text style={styles.metaValue}>{address}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{date}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Recipient</Text>
            <Text style={styles.metaValue}>{recipient}</Text>
          </View>
        </View>

        <View>
          <Text style={styles.h2}>Summary</Text>
          <Text style={styles.text}>
            {summary || ""}
          </Text>
          {overallScore !== "" ? (
            <Text style={[styles.text, { marginTop: 6 }]}>
              Overall score: {overallScore}/5
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: 8 }}>
          <Text style={styles.small}>Generated by Walter — clean notes, no fluff.</Text>
        </View>
      </Page>

      {/* ---- Sections ---- */}
      {SECTIONS.map((section) => (
        <Page key={section.key} size="A4" style={styles.page}>
          <Text style={styles.h2}>{section.key}</Text>
          <View style={styles.section}>
            {section.fields.map(([name, label]) => (
              <View key={`${section.key}-${name}`}>{renderField(name, label)}</View>
            ))}
          </View>
          {renderPhotoStrip(section.photosKey)}
        </Page>
      ))}
    </Document>
  )
}

// ---- Handler ----
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" })
  }

  try {
    const data = req.body || {}
    const to = data?.email
    const address = data?.address || "Untitled Address"
    const dateStr = data?.date || ""
    const summary = data?.meta?.summary || ""
          const filename = (data?.clientPdfFilename
        || `Home-Tour-Notes_${address}_${dateStr}.pdf`).replace(/[^\w.\- ]+/g, "_")


    // Build PDF
    let pdfBuffer
    let pdfBase64
    if (data?.clientPdfBase64) {
      pdfBase64 = String(data.clientPdfBase64)
      pdfBuffer = Buffer.from(pdfBase64, "base64")
    } else {
      const logoDataUri = readLogoDataUri()
      pdfBuffer = await pdf(
        <PdfDoc data={data} summary={data?.meta?.summary || ""} logoDataUri={logoDataUri} />
      ).toBuffer()
      pdfBase64 = pdfBuffer.toString("base64")
    }


    // Send email
    const subject = `Your Home Tour Notes – ${address}`
    const textBody = [
      summary,
      "",
      `Address: ${address}`,
      `Date: ${dateStr}`,
      `Recipient: ${to || "(missing)"}`,
      "",
      "Full notes are attached as a PDF.",
    ].join("\n")

    const sendResult = await resend.emails.send({
      from: FROM,
      to: [to || FROM],
      ...(BCCS.length ? { bcc: BCCS } : {}),

      subject,
      text: textBody,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })

    if (sendResult.error) {
      return res.status(500).json({
        success: false,
        error: sendResult.error?.message || "Email send failed",
        // Provide PDF for client-side fallback (auto-download)
        pdfBase64,
        filename,
      })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    // If PDF exists, include it for fallback
    let pdfBase64 = null
    let filename = "Home-Tour-Notes.pdf"
    try {
      const data = req.body || {}
      const address = data?.address || "Untitled Address"
      const dateStr = data?.date || ""
      filename = `Home-Tour-Notes_${address}_${dateStr}.pdf`.replace(/[^\w.\- ]+/g, "_")
      // Build or accept PDF
      const logoDataUri = readLogoDataUri()
      if (data?.clientPdfBase64) {
        pdfBase64 = String(data.clientPdfBase64)
      } else {
        const buf = await pdf(
          <PdfDoc data={data} summary={data?.meta?.summary || ""} logoDataUri={logoDataUri} />
        ).toBuffer()
        pdfBase64 = buf.toString("base64")
      }

    } catch (_) {}

    return res.status(500).json({
      success: false,
      error: err?.message || "Unexpected error",
      pdfBase64,
      filename,
    })
  }
}
