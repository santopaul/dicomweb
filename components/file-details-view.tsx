"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Eye, Shield, Download, FileText, AlertTriangle, Clock, User, Camera, Zap } from "lucide-react"
import type { DicomMetadata, ProcessingOptions } from "@/lib/dicom-processor"
import { DicomImageViewer } from "./dicom-image-viewer"
import { AnonymizationSettings } from "./anonymization-settings"

interface FileDetailsViewProps {
  file: File
  metadata: DicomMetadata
  onBack: () => void
  onAnonymize: (options: ProcessingOptions) => void
  processingTime?: number
}

export function FileDetailsView({ file, metadata, onBack, onAnonymize, processingTime }: FileDetailsViewProps) {
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [showAnonymization, setShowAnonymization] = useState(false)
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    anonymize: false,
    anonymize_mode: "pseudonymize",
    remove_private_tags: false,
    output_formats: ["json"],
  })

  if (showImageViewer) {
    return <DicomImageViewer file={file} metadata={metadata} onClose={() => setShowImageViewer(false)} />
  }

  if (showAnonymization) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Anonymization Settings</h2>
            <p className="text-muted-foreground">Configure privacy settings for {file.name}</p>
          </div>
          <Button variant="outline" onClick={() => setShowAnonymization(false)}>
            ← Back to Details
          </Button>
        </div>

        <AnonymizationSettings options={processingOptions} onChange={setProcessingOptions} />

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowAnonymization(false)}>
            Cancel
          </Button>
          <Button onClick={() => onAnonymize(processingOptions)} className="bg-primary hover:bg-primary/90">
            <Shield className="w-4 h-4 mr-2" />
            Apply Anonymization
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">DICOM File Details</h2>
          <p className="text-muted-foreground">{file.name}</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          ← Back to Upload
        </Button>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2 bg-transparent"
              onClick={() => setShowImageViewer(true)}
            >
              <Eye className="w-6 h-6" />
              <span className="text-sm">View Image</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2 bg-transparent"
              onClick={() => setShowAnonymization(true)}
            >
              <Shield className="w-6 h-6" />
              <span className="text-sm">Anonymize</span>
            </Button>

            <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2 bg-transparent">
              <Download className="w-6 h-6" />
              <span className="text-sm">Export Data</span>
            </Button>

            <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2 bg-transparent">
              <FileText className="w-6 h-6" />
              <span className="text-sm">Generate Report</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Patient Privacy</p>
                <p className="font-semibold">{metadata.phi_removed === "YES" ? "Anonymized" : "Contains PHI"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${metadata.urgent ? "bg-destructive/10" : "bg-muted"}`}>
                <AlertTriangle
                  className={`w-5 h-5 ${metadata.urgent ? "text-destructive" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Study Priority</p>
                <p className="font-semibold">{metadata.urgent ? "URGENT" : "Routine"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Processing Time</p>
                <p className="font-semibold">{processingTime ? `${processingTime.toFixed(2)}s` : "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clinical Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Clinical Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Patient Age</p>
                <p className="font-medium">{metadata.patient_age || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Patient Sex</p>
                <p className="font-medium">{metadata.patient_sex || "N/A"}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Body Part Examined</p>
              <p className="font-medium">{metadata.body_part_examined || "N/A"}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Study Description</p>
              <p className="font-medium">{metadata.study_description || "N/A"}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Series Description</p>
              <p className="font-medium">{metadata.series_description || "N/A"}</p>
            </div>

            {/* Status Badges */}
            <div className="flex gap-2 flex-wrap pt-2">
              <Badge variant="outline">{metadata.modality}</Badge>
              {metadata.urgent && <Badge variant="destructive">URGENT</Badge>}
              {metadata.phi_removed === "YES" && (
                <Badge variant="default" className="bg-primary">
                  ANONYMIZED
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Technical Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Study Date</p>
                <p className="font-medium">{metadata.study_date || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Study Time</p>
                <p className="font-medium">{metadata.study_time || "N/A"}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Institution</p>
              <p className="font-medium">{metadata.institution_name || "N/A"}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Manufacturer</p>
              <p className="font-medium">{metadata.manufacturer || "N/A"}</p>
            </div>

            {metadata.slice_thickness && (
              <div>
                <p className="text-sm text-muted-foreground">Slice Thickness</p>
                <p className="font-medium">{metadata.slice_thickness}mm</p>
              </div>
            )}

            {metadata.pixel_spacing && (
              <div>
                <p className="text-sm text-muted-foreground">Pixel Spacing</p>
                <p className="font-medium">{metadata.pixel_spacing}</p>
              </div>
            )}

            <div className="pt-2">
              <p className="text-sm text-muted-foreground">File Size</p>
              <p className="font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PHI Detection Warning */}
      {metadata.phi_removed !== "YES" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-800">Protected Health Information Detected</h4>
                <p className="text-sm text-amber-700 mt-1">
                  This file contains patient identifiable information. Consider anonymizing before sharing or exporting.
                </p>
                <Button
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700"
                  onClick={() => setShowAnonymization(true)}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Configure Anonymization
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
