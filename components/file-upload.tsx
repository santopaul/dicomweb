"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, File, X, CheckCircle, AlertCircle, Eye, Settings, FileText, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DicomMetadata, ProcessingOptions } from "@/lib/dicom-processor"
import type { ProcessedFileData } from "@/lib/report-generator"
import { AnonymizationSettings } from "./anonymization-settings"
import { ReportGenerator } from "./report-generator"
import { BatchProcessingDashboard } from "./batch-processing-dashboard"
import { FileDetailsView } from "./file-details-view"

interface UploadedFile {
  file: File
  id: string
  status: "pending" | "processing" | "completed" | "error"
  progress: number
  metadata?: DicomMetadata
  error?: string
  processingTime?: number
}

export function FileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showBatchDashboard, setShowBatchDashboard] = useState(false)
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    anonymize: false,
    anonymize_mode: "pseudonymize",
    remove_private_tags: false,
    output_formats: ["json"],
  })
  const [viewMode, setViewMode] = useState<"upload" | "details" | "settings" | "reports" | "batch">("upload")

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: "pending",
      progress: 0,
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/dicom": [".dcm"],
      "application/octet-stream": [".dcm"],
    },
    multiple: true,
  })

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
    if (selectedFile?.id === id) {
      setSelectedFile(null)
    }
  }

  const processFiles = async () => {
    setIsProcessing(true)

    const pendingFiles = uploadedFiles.filter((f) => f.status === "pending")

    for (const uploadedFile of pendingFiles) {
      try {
        // Update status to processing
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === uploadedFile.id ? { ...f, status: "processing", progress: 0 } : f)),
        )

        // Create form data
        const formData = new FormData()
        formData.append("file", uploadedFile.file)
        formData.append("options", JSON.stringify(processingOptions))

        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadedFiles((prev) =>
            prev.map((f) => {
              if (f.id === uploadedFile.id && f.status === "processing") {
                const newProgress = Math.min(f.progress + 10, 90)
                return { ...f, progress: newProgress }
              }
              return f
            }),
          )
        }, 200)

        // Make API call
        const response = await fetch("/api/dicom/process", {
          method: "POST",
          body: formData,
        })

        clearInterval(progressInterval)

        if (response.ok) {
          const result = await response.json()
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uploadedFile.id
                ? {
                    ...f,
                    status: "completed",
                    progress: 100,
                    metadata: result.metadata,
                    processingTime: result.processing_time,
                  }
                : f,
            ),
          )
        } else {
          const error = await response.json()
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uploadedFile.id
                ? {
                    ...f,
                    status: "error",
                    progress: 0,
                    error: error.error || "Processing failed",
                  }
                : f,
            ),
          )
        }
      } catch (error) {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id
              ? {
                  ...f,
                  status: "error",
                  progress: 0,
                  error: "Network error",
                }
              : f,
          ),
        )
      }
    }

    setIsProcessing(false)
  }

  const processFileWithOptions = async (uploadedFile: UploadedFile, options: ProcessingOptions) => {
    try {
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === uploadedFile.id ? { ...f, status: "processing", progress: 0 } : f)),
      )

      const formData = new FormData()
      formData.append("file", uploadedFile.file)
      formData.append("options", JSON.stringify(options))

      const response = await fetch("/api/dicom/process", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id
              ? {
                  ...f,
                  status: "completed",
                  progress: 100,
                  metadata: result.metadata,
                  processingTime: result.processing_time,
                }
              : f,
          ),
        )
      }
    } catch (error) {
      console.error("Processing failed:", error)
    }
  }

  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-primary" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />
      case "processing":
        return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      default:
        return <File className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: UploadedFile["status"]) => {
    const variants = {
      pending: "secondary",
      processing: "default",
      completed: "default",
      error: "destructive",
    } as const

    const labels = {
      pending: "Pending",
      processing: "Processing",
      completed: "Completed",
      error: "Error",
    }

    return (
      <Badge variant={variants[status]} className={cn(status === "completed" && "bg-primary text-primary-foreground")}>
        {labels[status]}
      </Badge>
    )
  }

  // Convert uploaded files to report format
  const getReportFiles = (): ProcessedFileData[] => {
    return uploadedFiles
      .map((file) => ({
        fileName: file.file.name,
        fileSize: file.file.size,
        metadata: file.metadata!,
        processingTime: file.processingTime || 0,
        status: file.status === "completed" ? "success" : "error",
        error: file.error,
      }))
      .filter((f) => f.status === "success" || f.error)
  }

  const handleViewFile = (uploadedFile: UploadedFile) => {
    setSelectedFile(uploadedFile)
    setViewMode("details")
  }

  if (viewMode === "details" && selectedFile?.metadata) {
    return (
      <FileDetailsView
        file={selectedFile.file}
        metadata={selectedFile.metadata}
        processingTime={selectedFile.processingTime}
        onBack={() => {
          setSelectedFile(null)
          setViewMode("upload")
        }}
        onAnonymize={(options) => {
          // Handle anonymization request
          setProcessingOptions(options)
          // Re-process file with anonymization
          processFileWithOptions(selectedFile, options)
          setViewMode("upload")
        }}
      />
    )
  }

  if (showBatchDashboard) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setShowBatchDashboard(false)}>
            ← Back to Simple Upload
          </Button>
        </div>
        <BatchProcessingDashboard />
      </div>
    )
  }

  if (showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setShowSettings(false)}>
            ← Back to Upload
          </Button>
        </div>

        <AnonymizationSettings options={processingOptions} onChange={setProcessingOptions} />
      </div>
    )
  }

  if (showReports) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setShowReports(false)}>
            ← Back to Files
          </Button>
        </div>

        <ReportGenerator files={getReportFiles()} processingOptions={processingOptions} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DICOM File Processing</h1>
          <p className="text-muted-foreground">Upload and process DICOM files with metadata extraction</p>
        </div>
        <Button variant="outline" onClick={() => setShowBatchDashboard(true)}>
          <BarChart3 className="w-4 h-4 mr-2" />
          Batch Dashboard
        </Button>
      </div>

      {/* Drop Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
        )}
      >
        <CardContent className="p-8">
          <div {...getRootProps()} className="text-center">
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {isDragActive ? "Drop DICOM files here" : "Upload DICOM Files"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Drag and drop your .dcm files here, or click to browse</p>
            <Button variant="outline" type="button">
              Select Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Uploaded Files ({uploadedFiles.length})</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowSettings(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                {uploadedFiles.some((f) => f.status === "completed") && (
                  <Button variant="outline" onClick={() => setShowReports(true)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Reports
                  </Button>
                )}
                <Button
                  onClick={processFiles}
                  disabled={isProcessing || uploadedFiles.every((f) => f.status !== "pending")}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isProcessing ? "Processing..." : "Process Files"}
                </Button>
              </div>
            </div>

            {/* Processing Options Summary */}
            {processingOptions.anonymize && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">Anonymization: {processingOptions.anonymize_mode}</Badge>
                  {processingOptions.remove_private_tags && <Badge variant="outline">Private tags removed</Badge>}
                  {processingOptions.anonymize_salt && <Badge variant="outline">Custom salt</Badge>}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {uploadedFiles.map((uploadedFile) => (
                <div key={uploadedFile.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  {getStatusIcon(uploadedFile.status)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{uploadedFile.file.name}</p>
                      {getStatusBadge(uploadedFile.status)}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>

                    {uploadedFile.status === "processing" && (
                      <Progress value={uploadedFile.progress} className="mt-2 h-1" />
                    )}

                    {uploadedFile.error && <p className="text-xs text-destructive mt-1">{uploadedFile.error}</p>}

                    {uploadedFile.metadata && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {uploadedFile.metadata.modality}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {uploadedFile.metadata.body_part_examined}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {uploadedFile.metadata.patient_age}
                        </Badge>
                        {uploadedFile.metadata.urgent && (
                          <Badge variant="destructive" className="text-xs">
                            URGENT
                          </Badge>
                        )}
                        {uploadedFile.metadata.phi_removed === "YES" && (
                          <Badge variant="default" className="text-xs bg-primary">
                            ANONYMIZED
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {uploadedFile.status === "completed" && uploadedFile.metadata && (
                      <Button variant="ghost" size="sm" onClick={() => handleViewFile(uploadedFile)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadedFile.id)}
                      disabled={uploadedFile.status === "processing"}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
