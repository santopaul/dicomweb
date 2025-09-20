"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Play,
  Pause,
  Upload,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Settings,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProcessingOptions, DicomMetadata } from "@/lib/dicom-processor"
import type { ProcessedFileData } from "@/lib/report-generator"
import { AnonymizationSettings } from "./anonymization-settings"
import { ReportGenerator } from "./report-generator"

interface BatchFile {
  id: string
  file: File
  status: "queued" | "processing" | "completed" | "error" | "paused"
  progress: number
  metadata?: DicomMetadata
  error?: string
  processingTime?: number
  startTime?: number
}

interface BatchJob {
  id: string
  name: string
  files: BatchFile[]
  status: "idle" | "running" | "paused" | "completed" | "error"
  progress: number
  startTime?: number
  endTime?: number
  processingOptions: ProcessingOptions
}

export function BatchProcessingDashboard() {
  const [jobs, setJobs] = useState<BatchJob[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [selectedJobForReports, setSelectedJobForReports] = useState<BatchJob | null>(null)
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    anonymize: false,
    anonymize_mode: "pseudonymize",
    remove_private_tags: false,
    output_formats: ["json"],
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const processingController = useRef<AbortController | null>(null)

  const createNewJob = useCallback(
    (files: File[]) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const batchFiles: BatchFile[] = files.map((file, index) => ({
        id: `${jobId}_file_${index}`,
        file,
        status: "queued",
        progress: 0,
      }))

      const newJob: BatchJob = {
        id: jobId,
        name: `Batch Job ${new Date().toLocaleTimeString()}`,
        files: batchFiles,
        status: "idle",
        progress: 0,
        processingOptions: { ...processingOptions },
      }

      setJobs((prev) => [newJob, ...prev])
      return jobId
    },
    [processingOptions],
  )

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length > 0) {
        const validFiles = files.filter((file) => file.name.toLowerCase().endsWith(".dcm"))
        if (validFiles.length > 0) {
          createNewJob(validFiles)
        }
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [createNewJob],
  )

  const startJob = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || job.status === "running") return

    setActiveJobId(jobId)
    processingController.current = new AbortController()

    // Update job status
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "running", startTime: Date.now() } : j)))

    try {
      const queuedFiles = job.files.filter((f) => f.status === "queued" || f.status === "paused")

      for (let i = 0; i < queuedFiles.length; i++) {
        const file = queuedFiles[i]

        if (processingController.current?.signal.aborted) {
          break
        }

        // Update file status to processing
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  files: j.files.map((f) =>
                    f.id === file.id ? { ...f, status: "processing", progress: 0, startTime: Date.now() } : f,
                  ),
                }
              : j,
          ),
        )

        try {
          // Create form data for single file
          const formData = new FormData()
          formData.append("file", file.file)
          formData.append("options", JSON.stringify(job.processingOptions))

          // Simulate progress updates
          const progressInterval = setInterval(() => {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      files: j.files.map((f) =>
                        f.id === file.id && f.status === "processing"
                          ? { ...f, progress: Math.min(f.progress + 10, 90) }
                          : f,
                      ),
                    }
                  : j,
              ),
            )
          }, 200)

          // Process file
          const response = await fetch("/api/dicom/process", {
            method: "POST",
            body: formData,
            signal: processingController.current?.signal,
          })

          clearInterval(progressInterval)

          if (response.ok) {
            const result = await response.json()

            // Update file with results
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      files: j.files.map((f) =>
                        f.id === file.id
                          ? {
                              ...f,
                              status: "completed",
                              progress: 100,
                              metadata: result.metadata,
                              processingTime: result.processing_time,
                            }
                          : f,
                      ),
                    }
                  : j,
              ),
            )
          } else {
            const error = await response.json()

            // Update file with error
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      files: j.files.map((f) =>
                        f.id === file.id
                          ? {
                              ...f,
                              status: "error",
                              progress: 0,
                              error: error.error || "Processing failed",
                            }
                          : f,
                      ),
                    }
                  : j,
              ),
            )
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            // Update file status to paused
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      files: j.files.map((f) => (f.id === file.id ? { ...f, status: "paused", progress: 0 } : f)),
                    }
                  : j,
              ),
            )
          } else {
            // Update file with error
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      files: j.files.map((f) =>
                        f.id === file.id
                          ? {
                              ...f,
                              status: "error",
                              progress: 0,
                              error: "Network error",
                            }
                          : f,
                      ),
                    }
                  : j,
              ),
            )
          }
        }

        // Update job progress
        const updatedJob = jobs.find((j) => j.id === jobId)
        if (updatedJob) {
          const completedFiles = updatedJob.files.filter((f) => f.status === "completed" || f.status === "error").length
          const totalFiles = updatedJob.files.length
          const jobProgress = Math.round((completedFiles / totalFiles) * 100)

          setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, progress: jobProgress } : j)))
        }
      }

      // Mark job as completed
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: "completed",
                endTime: Date.now(),
                progress: 100,
              }
            : j,
        ),
      )
    } catch (error) {
      // Mark job as error
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "error" } : j)))
    } finally {
      setActiveJobId(null)
      processingController.current = null
    }
  }

  const pauseJob = (jobId: string) => {
    if (processingController.current) {
      processingController.current.abort()
    }

    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "paused" } : j)))
    setActiveJobId(null)
  }

  const deleteJob = (jobId: string) => {
    if (activeJobId === jobId) {
      pauseJob(jobId)
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
  }

  const getJobStats = (job: BatchJob) => {
    const completed = job.files.filter((f) => f.status === "completed").length
    const errors = job.files.filter((f) => f.status === "error").length
    const processing = job.files.filter((f) => f.status === "processing").length
    const queued = job.files.filter((f) => f.status === "queued").length

    return { completed, errors, processing, queued, total: job.files.length }
  }

  const getJobDuration = (job: BatchJob) => {
    if (!job.startTime) return null
    const endTime = job.endTime || Date.now()
    return Math.round((endTime - job.startTime) / 1000)
  }

  const getReportFiles = (job: BatchJob): ProcessedFileData[] => {
    return job.files
      .filter((f) => f.status === "completed" || f.status === "error")
      .map((f) => ({
        fileName: f.file.name,
        fileSize: f.file.size,
        metadata: f.metadata!,
        processingTime: f.processingTime || 0,
        status: f.status === "completed" ? "success" : "error",
        error: f.error,
      }))
  }

  if (showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setShowSettings(false)}>
            ← Back to Dashboard
          </Button>
        </div>
        <AnonymizationSettings options={processingOptions} onChange={setProcessingOptions} />
      </div>
    )
  }

  if (showReports && selectedJobForReports) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => {
              setShowReports(false)
              setSelectedJobForReports(null)
            }}
          >
            ← Back to Dashboard
          </Button>
        </div>
        <ReportGenerator
          files={getReportFiles(selectedJobForReports)}
          processingOptions={selectedJobForReports.processingOptions}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Batch Processing Dashboard</h1>
          <p className="text-muted-foreground mt-1">Process multiple DICOM files efficiently</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            New Batch Job
          </Button>
          <input ref={fileInputRef} type="file" multiple accept=".dcm" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      {/* Overview Stats */}
      {jobs.length > 0 && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Jobs</span>
              </div>
              <div className="text-2xl font-bold mt-1">{jobs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Running</span>
              </div>
              <div className="text-2xl font-bold mt-1 text-green-600">
                {jobs.filter((j) => j.status === "running").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
              <div className="text-2xl font-bold mt-1 text-primary">
                {jobs.filter((j) => j.status === "completed").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Files</span>
              </div>
              <div className="text-2xl font-bold mt-1">{jobs.reduce((sum, job) => sum + job.files.length, 0)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Batch Jobs</h3>
            <p className="text-muted-foreground mb-4">Create your first batch job by uploading multiple DICOM files</p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const stats = getJobStats(job)
            const duration = getJobDuration(job)

            return (
              <Card key={job.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{job.name}</CardTitle>
                      <CardDescription>
                        {stats.total} files • Created {new Date(Number.parseInt(job.id.split("_")[1])).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "default"
                            : job.status === "running"
                              ? "default"
                              : job.status === "error"
                                ? "destructive"
                                : "secondary"
                        }
                        className={cn(
                          job.status === "completed" && "bg-primary text-primary-foreground",
                          job.status === "running" && "bg-green-600 text-white",
                        )}
                      >
                        {job.status}
                      </Badge>
                      {job.status === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedJobForReports(job)
                            setShowReports(true)
                          }}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Report
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteJob(job.id)}
                        disabled={job.status === "running"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span>{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="h-2" />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-primary">{stats.completed}</div>
                      <div className="text-muted-foreground">Completed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{stats.errors}</div>
                      <div className="text-muted-foreground">Errors</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-blue-600">{stats.processing}</div>
                      <div className="text-muted-foreground">Processing</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-600">{stats.queued}</div>
                      <div className="text-muted-foreground">Queued</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold">{duration ? `${duration}s` : "-"}</div>
                      <div className="text-muted-foreground">Duration</div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    {job.status === "idle" || job.status === "paused" ? (
                      <Button
                        size="sm"
                        onClick={() => startJob(job.id)}
                        disabled={activeJobId !== null && activeJobId !== job.id}
                      >
                        <Play className="w-4 h-4 mr-1" />
                        {job.status === "paused" ? "Resume" : "Start"}
                      </Button>
                    ) : job.status === "running" ? (
                      <Button size="sm" variant="outline" onClick={() => pauseJob(job.id)}>
                        <Pause className="w-4 h-4 mr-1" />
                        Pause
                      </Button>
                    ) : null}

                    {job.processingOptions.anonymize && (
                      <Badge variant="outline" className="text-xs">
                        Anonymized
                      </Badge>
                    )}
                  </div>

                  {/* File Details (Expandable) */}
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="files">Files ({stats.total})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                      {stats.errors > 0 && (
                        <Alert className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            {stats.errors} files failed to process. Check the Files tab for details.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="text-sm text-muted-foreground">
                        <p>Processing Options:</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>Anonymization: {job.processingOptions.anonymize ? "Enabled" : "Disabled"}</li>
                          {job.processingOptions.anonymize && <li>Mode: {job.processingOptions.anonymize_mode}</li>}
                          <li>Private Tags: {job.processingOptions.remove_private_tags ? "Removed" : "Preserved"}</li>
                        </ul>
                      </div>
                    </TabsContent>

                    <TabsContent value="files" className="mt-4">
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {job.files.map((file) => (
                          <div key={file.id} className="flex items-center gap-3 p-2 border rounded text-sm">
                            {file.status === "completed" ? (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            ) : file.status === "error" ? (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            ) : file.status === "processing" ? (
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            )}

                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{file.file.name}</p>
                              {file.error && <p className="text-xs text-destructive">{file.error}</p>}
                              {file.status === "processing" && <Progress value={file.progress} className="mt-1 h-1" />}
                            </div>

                            <Badge
                              variant={
                                file.status === "completed"
                                  ? "default"
                                  : file.status === "error"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className={cn(file.status === "completed" && "bg-primary text-primary-foreground")}
                            >
                              {file.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
