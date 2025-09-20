"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Shield, Info, Key, Eye, EyeOff, RefreshCw } from "lucide-react"
import type { ProcessingOptions } from "@/lib/dicom-processor"

interface AnonymizationSettingsProps {
  options: ProcessingOptions
  onChange: (options: ProcessingOptions) => void
  className?: string
}

const DEFAULT_ANONYMIZATION_TAGS = [
  "patient_name",
  "patient_id",
  "patient_birth_date",
  "patient_birth_time",
  "patient_age",
  "patient_address",
  "other_patient_ids",
  "other_patient_names",
  "referring_physician_name",
  "performing_physician_name",
  "operators_name",
  "institution_name",
  "station_name",
  "accession_number",
  "study_id",
  "series_description",
  "study_comments",
]

export function AnonymizationSettings({ options, onChange, className }: AnonymizationSettingsProps) {
  const [showSalt, setShowSalt] = useState(false)
  const [customTags, setCustomTags] = useState(options.anonymize_tags?.join(", ") || "")

  const updateOptions = (updates: Partial<ProcessingOptions>) => {
    onChange({ ...options, ...updates })
  }

  const generateRandomSalt = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let result = ""
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    updateOptions({ anonymize_salt: result })
  }

  const handleCustomTagsChange = (value: string) => {
    setCustomTags(value)
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    updateOptions({
      anonymize_tags: tags.length > 0 ? tags : undefined,
    })
  }

  const resetToDefaults = () => {
    setCustomTags("")
    updateOptions({
      anonymize_tags: undefined,
      anonymize_salt: undefined,
    })
  }

  const tagsToUse = options.anonymize_tags || DEFAULT_ANONYMIZATION_TAGS

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Anonymization Settings
          </CardTitle>
          <CardDescription>Configure PHI removal and anonymization options for DICOM processing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Anonymization */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="anonymize" className="text-base font-medium">
                Enable Anonymization
              </Label>
              <p className="text-sm text-muted-foreground">Remove or pseudonymize PHI from DICOM metadata</p>
            </div>
            <Switch
              id="anonymize"
              checked={options.anonymize}
              onCheckedChange={(checked) => updateOptions({ anonymize: checked })}
            />
          </div>

          {options.anonymize && (
            <>
              <Separator />

              {/* Anonymization Mode */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Anonymization Mode</Label>
                <Select
                  value={options.anonymize_mode}
                  onValueChange={(value: "pseudonymize" | "remove") => updateOptions({ anonymize_mode: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pseudonymize">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Pseudonymize</span>
                        <span className="text-xs text-muted-foreground">
                          Replace with hashed values (reversible with salt)
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="remove">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Remove</span>
                        <span className="text-xs text-muted-foreground">Replace with "REDACTED" (irreversible)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Salt Configuration */}
              {options.anonymize_mode === "pseudonymize" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Anonymization Salt</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowSalt(!showSalt)}>
                        {showSalt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={generateRandomSalt}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    type={showSalt ? "text" : "password"}
                    placeholder="Enter salt for reproducible anonymization"
                    value={options.anonymize_salt || ""}
                    onChange={(e) => updateOptions({ anonymize_salt: e.target.value })}
                  />
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Important:</strong> Save this salt to ensure consistent anonymization across processing
                      sessions. Without the salt, pseudonymized values cannot be mapped back to original data.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Tags to Anonymize */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Fields to Anonymize</Label>
                  <Button variant="outline" size="sm" onClick={resetToDefaults}>
                    Reset to Defaults
                  </Button>
                </div>

                <Textarea
                  placeholder="Enter comma-separated field names (leave empty for defaults)"
                  value={customTags}
                  onChange={(e) => handleCustomTagsChange(e.target.value)}
                  rows={3}
                />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Fields that will be anonymized ({tagsToUse.length}):</p>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {tagsToUse.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Remove Private Tags */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="remove-private" className="text-base font-medium">
                    Remove Private Tags
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Remove all private DICOM tags (recommended for anonymization)
                  </p>
                </div>
                <Switch
                  id="remove-private"
                  checked={options.remove_private_tags}
                  onCheckedChange={(checked) => updateOptions({ remove_private_tags: checked })}
                />
              </div>

              {/* Anonymization Summary */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Anonymization Summary:</p>
                    <ul className="text-sm space-y-1">
                      <li>
                        • Mode: <strong>{options.anonymize_mode}</strong>
                      </li>
                      <li>
                        • Fields: <strong>{tagsToUse.length} fields</strong>
                      </li>
                      <li>
                        • Private tags: <strong>{options.remove_private_tags ? "Removed" : "Preserved"}</strong>
                      </li>
                      <li>
                        • Salt: <strong>{options.anonymize_salt ? "Custom" : "Auto-generated"}</strong>
                      </li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
