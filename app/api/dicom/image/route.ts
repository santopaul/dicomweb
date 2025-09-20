import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Read file as buffer
    const buffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)

    // For now, create a simple grayscale pattern as placeholder
    const width = 512
    const height = 512
    const pixelData = new Uint8Array(width * height)

    // Generate a simple medical-looking pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        // Create a circular pattern with some noise
        const centerX = width / 2
        const centerY = height / 2
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
        const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2)

        // Create concentric circles with noise
        const normalizedDistance = distance / maxDistance
        const circles = Math.sin(normalizedDistance * 20) * 0.5 + 0.5
        const noise = Math.random() * 0.2
        const value = Math.max(0, Math.min(255, (circles + noise) * 255))

        pixelData[index] = value
      }
    }

    return NextResponse.json({
      success: true,
      width,
      height,
      pixelData: Array.from(pixelData), // Convert to regular array for JSON
      bitsAllocated: 8,
      bitsStored: 8,
      samplesPerPixel: 1,
    })
  } catch (error) {
    console.error("Error processing DICOM image:", error)
    return NextResponse.json({ error: "Failed to extract image data" }, { status: 500 })
  }
}
