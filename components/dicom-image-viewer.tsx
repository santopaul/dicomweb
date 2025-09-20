"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from "lucide-react"
import type { DicomMetadata } from "@/lib/dicom-processor"

interface DicomImageViewerProps {
  file: File
  metadata: DicomMetadata
  onClose: () => void
}

export function DicomImageViewer({ file, metadata, onClose }: DicomImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [windowLevel, setWindowLevel] = useState(50)
  const [windowWidth, setWindowWidth] = useState(100)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDicomImage()
  }, [file])

  useEffect(() => {
    if (imageData && canvasRef.current) {
      renderImage()
    }
  }, [imageData, zoom, rotation, windowLevel, windowWidth])

  const loadDicomImage = async () => {
    try {
      setIsLoading(true)

      // Create form data with the DICOM file
      const formData = new FormData()
      formData.append("file", file)

      // Call API to extract pixel data
      const response = await fetch("/api/dicom/image", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()

        // Create ImageData from the pixel array
        if (result.pixelData && result.width && result.height) {
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")

          if (ctx) {
            canvas.width = result.width
            canvas.height = result.height

            const imageData = ctx.createImageData(result.width, result.height)
            const pixels = new Uint8Array(result.pixelData)

            // Convert grayscale to RGBA
            for (let i = 0; i < pixels.length; i++) {
              const pixelValue = pixels[i]
              const index = i * 4
              imageData.data[index] = pixelValue // R
              imageData.data[index + 1] = pixelValue // G
              imageData.data[index + 2] = pixelValue // B
              imageData.data[index + 3] = 255 // A
            }

            setImageData(imageData)
          }
        }
      }
    } catch (error) {
      console.error("Failed to load DICOM image:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const renderImage = () => {
    const canvas = canvasRef.current
    if (!canvas || !imageData) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Save context for transformations
    ctx.save()

    // Apply transformations
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.scale(zoom, zoom)
    ctx.rotate((rotation * Math.PI) / 180)

    // Apply window/level adjustments
    const tempCanvas = document.createElement("canvas")
    const tempCtx = tempCanvas.getContext("2d")
    if (tempCtx) {
      tempCanvas.width = imageData.width
      tempCanvas.height = imageData.height

      // Apply window/level to image data
      const adjustedImageData = tempCtx.createImageData(imageData.width, imageData.height)
      for (let i = 0; i < imageData.data.length; i += 4) {
        const gray = imageData.data[i]
        const adjusted = Math.max(0, Math.min(255, ((gray - windowLevel + windowWidth / 2) / windowWidth) * 255))

        adjustedImageData.data[i] = adjusted // R
        adjustedImageData.data[i + 1] = adjusted // G
        adjustedImageData.data[i + 2] = adjusted // B
        adjustedImageData.data[i + 3] = 255 // A
      }

      tempCtx.putImageData(adjustedImageData, 0, 0)

      // Draw adjusted image
      ctx.drawImage(tempCanvas, -imageData.width / 2, -imageData.height / 2)
    }

    // Restore context
    ctx.restore()
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 5))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1))
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360)

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const link = document.createElement("a")
      link.download = `${file.name.replace(".dcm", "")}_image.png`
      link.href = canvas.toDataURL()
      link.click()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">DICOM Image Viewer</h2>
          <p className="text-muted-foreground">{file.name}</p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Close Viewer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Image Display */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Medical Image</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{metadata.modality}</Badge>
                <Badge variant="outline">{metadata.body_part_examined}</Badge>
                {metadata.urgent && <Badge variant="destructive">URGENT</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading DICOM image...</p>
                </div>
              </div>
            ) : imageData ? (
              <div className="relative bg-black rounded-lg overflow-hidden">
                <canvas ref={canvasRef} width={600} height={600} className="w-full h-auto max-h-96 object-contain" />

                {/* Image Controls Overlay */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handleZoomIn}>
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleZoomOut}>
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleRotate}>
                    <RotateCw className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>

                {/* Image Info Overlay */}
                <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-2 rounded text-sm">
                  <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
                  <div>Rotation: {rotation}°</div>
                  <div>
                    {imageData.width} × {imageData.height}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
                <div className="text-center">
                  <Maximize2 className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Unable to load image data</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Image Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Image Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Zoom Control */}
            <div>
              <label className="text-sm font-medium mb-2 block">Zoom: {(zoom * 100).toFixed(0)}%</label>
              <Slider
                value={[zoom * 100]}
                onValueChange={([value]) => setZoom(value / 100)}
                min={10}
                max={500}
                step={10}
                className="w-full"
              />
            </div>

            {/* Window Level */}
            <div>
              <label className="text-sm font-medium mb-2 block">Window Level: {windowLevel}</label>
              <Slider
                value={[windowLevel]}
                onValueChange={([value]) => setWindowLevel(value)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Window Width */}
            <div>
              <label className="text-sm font-medium mb-2 block">Window Width: {windowWidth}</label>
              <Slider
                value={[windowWidth]}
                onValueChange={([value]) => setWindowWidth(value)}
                min={1}
                max={200}
                step={1}
                className="w-full"
              />
            </div>

            {/* Quick Presets */}
            <div>
              <label className="text-sm font-medium mb-2 block">Quick Presets</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWindowLevel(40)
                    setWindowWidth(80)
                  }}
                >
                  Soft Tissue
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWindowLevel(80)
                    setWindowWidth(200)
                  }}
                >
                  Bone
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWindowLevel(60)
                    setWindowWidth(120)
                  }}
                >
                  Lung
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setZoom(1)
                    setRotation(0)
                    setWindowLevel(50)
                    setWindowWidth(100)
                  }}
                >
                  Reset All
                </Button>
              </div>
            </div>

            {/* Image Information */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Image Information</h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Study Date: {metadata.study_date}</div>
                <div>Series: {metadata.series_description}</div>
                <div>Institution: {metadata.institution_name}</div>
                {metadata.slice_thickness && <div>Slice Thickness: {metadata.slice_thickness}mm</div>}
                {metadata.pixel_spacing && <div>Pixel Spacing: {metadata.pixel_spacing}</div>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
