"use client"

import type { DicomMetadata } from "@/lib/dicom-processor"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Shield, User, Settings, Eye, Clock, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface MetadataDisplayProps {
  metadata: DicomMetadata
  fileName: string
  processingTime?: number
  className?: string
}

export function MetadataDisplay({ metadata, fileName, processingTime, className }: MetadataDisplayProps) {
  const formatDateTime = (dateTime: string) => {
    try {
      return new Date(dateTime).toLocaleString()
    } catch {
      return dateTime
    }
  }

  const StatSection = () => (
    <div className="space-y-4">
      {/* Urgent Alert */}
      {metadata.urgent && (
        <Alert className="border-destructive bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive font-medium">
            <strong>URGENT STUDY:</strong> {metadata.urgent_reasons.join(", ")}
          </AlertDescription>
        </Alert>
      )}

      {/* PHI Alert */}
      {metadata.phi_flags.length > 0 && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <Shield className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>PHI Detected:</strong> {metadata.phi_flags.join(", ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Patient Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Patient ID</p>
                <p className="font-mono">{metadata.patient_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{metadata.patient_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Age</p>
                <p>{metadata.patient_age}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sex</p>
                <p>{metadata.patient_sex}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Study Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Study Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Modality</p>
                <Badge variant="outline" className="font-mono">
                  {metadata.modality}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Body Part</p>
                <p className="font-medium">{metadata.body_part_examined}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Description</p>
                <p>{metadata.study_description}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Study Date/Time</p>
                <p className="font-mono text-xs">{formatDateTime(metadata.study_date_time)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Privacy Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Privacy Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">PHI Removed:</span>
              <Badge
                variant={metadata.phi_removed === "YES" ? "default" : "destructive"}
                className={cn(metadata.phi_removed === "YES" && "bg-primary text-primary-foreground")}
              >
                {metadata.phi_removed}
              </Badge>
            </div>
            {metadata.phi_flags.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">PHI Fields:</span>
                <span className="text-sm font-mono">{metadata.phi_flags.length}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const TechnicalSection = () => (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Equipment Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              Equipment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Manufacturer</p>
                <p className="font-medium">{metadata.manufacturer}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Model</p>
                <p>{metadata.model}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Software Version</p>
                <p className="font-mono text-xs">{metadata.software_versions}</p>
              </div>
              {metadata.magnetic_field_strength !== "N/A" && (
                <div>
                  <p className="text-muted-foreground">Magnetic Field Strength</p>
                  <p>{metadata.magnetic_field_strength}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Image Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Image Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Dimensions</p>
                <p className="font-mono">
                  {metadata.rows} × {metadata.columns}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Slice Thickness</p>
                <p>{metadata.slice_thickness} mm</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pixel Spacing</p>
                <p className="font-mono text-xs">{metadata.pixel_spacing}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Photometric</p>
                <p className="text-xs">{metadata.photometric_interpretation}</p>
              </div>
              {metadata.number_of_frames && (
                <div>
                  <p className="text-muted-foreground">Frames</p>
                  <p>{metadata.number_of_frames}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DICOM Identifiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">DICOM Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Study Instance UID</p>
              <p className="font-mono text-xs break-all">{metadata.study_instance_uid}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Series Instance UID</p>
              <p className="font-mono text-xs break-all">{metadata.series_instance_uid}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Transfer Syntax UID</p>
              <p className="font-mono text-xs break-all">{metadata.transfer_syntax_uid}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const PrivateTagsSection = () => (
    <div className="space-y-4">
      {metadata.private_tags.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No private tags found in this DICOM file</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {metadata.private_tags.map((tag, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {tag.tag}
                    </Badge>
                    {tag.name && <span className="text-sm font-medium">{tag.name}</span>}
                  </div>
                  {tag.creator && (
                    <Badge variant="secondary" className="text-xs">
                      {tag.creator}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>
                    <strong>Group:</strong> {tag.group} | <strong>Element:</strong> {tag.element}
                  </p>
                  {tag.keyword && (
                    <p>
                      <strong>Keyword:</strong> {tag.keyword}
                    </p>
                  )}
                  <p>
                    <strong>Preview:</strong> {tag.value_preview}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">DICOM Metadata</h2>
          <p className="text-sm text-muted-foreground mt-1">
            File: <span className="font-mono">{fileName}</span>
          </p>
        </div>
        {processingTime && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Processed in {processingTime}ms</span>
          </div>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="clinical" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
          <TabsTrigger value="private">Private Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="clinical" className="mt-6">
          <StatSection />
        </TabsContent>

        <TabsContent value="technical" className="mt-6">
          <TechnicalSection />
        </TabsContent>

        <TabsContent value="private" className="mt-6">
          <PrivateTagsSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
