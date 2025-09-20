import { type NextRequest, NextResponse } from "next/server"
import { processBatchFiles, type ProcessingOptions } from "@/lib/dicom-processor"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files: File[] = []
    const optionsJson = formData.get("options") as string

    // Extract all files from form data
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file_") && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Validate all files
    const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".dcm"))
    if (invalidFiles.length > 0) {
      return NextResponse.json(
        { error: `Invalid file types: ${invalidFiles.map((f) => f.name).join(", ")}. Only .dcm files are supported.` },
        { status: 400 },
      )
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

    // Convert files to buffers
    const fileBuffers = await Promise.all(
      files.map(async (file) => ({
        buffer: await file.arrayBuffer(),
        name: file.name,
      })),
    )

    // Process all files
    const results = await processBatchFiles(fileBuffers, options)

    // Separate successful and failed results
    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    return NextResponse.json({
      success: true,
      total_files: files.length,
      successful_count: successful.length,
      failed_count: failed.length,
      results: successful.map((r) => ({
        file_name: r.file_path,
        metadata: r.metadata,
        processing_time: r.processing_time,
      })),
      errors: failed.map((r) => ({
        file_name: r.file_path,
        error: r.error,
      })),
      total_processing_time: results.reduce((sum, r) => sum + r.processing_time, 0),
    })
  } catch (error) {
    console.error("Batch DICOM processing error:", error)
    return NextResponse.json({ error: "Internal server error during batch processing" }, { status: 500 })
  }
}
