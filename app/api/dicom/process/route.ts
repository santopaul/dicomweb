import { type NextRequest, NextResponse } from "next/server"
import { processDicomFile, type ProcessingOptions } from "@/lib/dicom-processor"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const optionsJson = formData.get("options") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".dcm")) {
      return NextResponse.json({ error: "Invalid file type. Only .dcm files are supported." }, { status: 400 })
    }

    // Parse processing options
    const options: ProcessingOptions = optionsJson
      ? JSON.parse(optionsJson)
      : {
          anonymize: false,
          anonymize_mode: "pseudonymize",
          remove_private_tags: false,
          output_formats: ["json"],
        }

    // Convert file to buffer
    const buffer = await file.arrayBuffer()

    // Process the DICOM file
    const result = await processDicomFile(buffer, file.name, options)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      metadata: result.metadata,
      processing_time: result.processing_time,
      file_name: file.name,
      file_size: file.size,
    })
  } catch (error) {
    console.error("DICOM processing error:", error)
    return NextResponse.json({ error: "Internal server error during DICOM processing" }, { status: 500 })
  }
}
