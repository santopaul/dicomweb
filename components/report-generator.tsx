"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Download, Eye, BarChart3, Shield, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type ReportData,
  type ReportTemplate,
  type ReportFormat,
  type ProcessedFileData,
  DEFAULT_TEMPLATES,
  generateReportData,
  generateHTMLReport,
  generateCSVReport,
  generateJSONReport,
} from "@/lib/report-generator"

interface ReportGeneratorProps {
  files: ProcessedFileData[]
  processingOptions: any
  className?: string
}

export function ReportGenerator({ files, processingOptions, className }: ReportGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate>(DEFAULT_TEMPLATES[0])
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("html")
  const [customSections, setCustomSections] = useState(selectedTemplate.sections)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedReport, setGeneratedReport] = useState<string | null>(null)
  const [reportData, setReportData] = useState<ReportData | null>(null)

  const handleTemplateChange = (templateId: string) => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId)
    if (template) {
      setSelectedTemplate(template)
      setCustomSections(template.sections)
    }
  }

  const handleSectionToggle = (sectionId: string, enabled: boolean) => {
    setCustomSections((prev) => prev.map((section) => (section.id === sectionId ? { ...section, enabled } : section)))
  }

  const generateReport = async () => {
    setIsGenerating(true)

    try {
      // Generate report data
      const data = generateReportData(files, processingOptions)
      setReportData(data)

      // Create custom template with selected sections
      const customTemplate = {
        ...selectedTemplate,
        sections: customSections,
      }

      // Generate report in selected format
      let reportContent: string

      switch (selectedFormat) {
        case "html":
          reportContent = generateHTMLReport(data, customTemplate)
          break
        case "csv":
          reportContent = generateCSVReport(data)
          break
        case "json":
          reportContent = generateJSONReport(data)
          break
        default:
          reportContent = generateHTMLReport(data, customTemplate)
      }

      setGeneratedReport(reportContent)
    } catch (error) {
      console.error("Report generation failed:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadReport = () => {
    if (!generatedReport || !reportData) return

    const mimeTypes = {
      html: "text/html",
      csv: "text/csv",
      json: "application/json",
      pdf: "application/pdf",
    }

    const extensions = {
      html: "html",
      csv: "csv",
      json: "json",
      pdf: "pdf",
    }

    const blob = new Blob([generatedReport], { type: mimeTypes[selectedFormat] })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${reportData.reportId}.${extensions[selectedFormat]}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const previewReport = () => {
    if (!generatedReport) return

    const newWindow = window.open()
    if (newWindow) {
      if (selectedFormat === "html") {
        newWindow.document.write(generatedReport)
      } else {
        newWindow.document.write(`<pre>${generatedReport}</pre>`)
      }
    }
  }

  const successfulFiles = files.filter((f) => f.status === "success")
  const failedFiles = files.filter((f) => f.status === "error")
  const urgentFiles = successfulFiles.filter((f) => f.metadata.urgent)
  const phiFiles = successfulFiles.filter((f) => f.metadata.phi_flags.length > 0)

  return (
    <div className={cn("space-y-6", className)}>
      {/* Report Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Report Generation
          </CardTitle>
          <CardDescription>Generate comprehensive reports from your processed DICOM files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-primary">{files.length}</div>
              <div className="text-sm text-muted-foreground">Total Files</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-green-600">{successfulFiles.length}</div>
              <div className="text-sm text-muted-foreground">Successful</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-red-600">{urgentFiles.length}</div>
              <div className="text-sm text-muted-foreground">Urgent Studies</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{phiFiles.length}</div>
              <div className="text-sm text-muted-foreground">PHI Detected</div>
            </div>
          </div>

          {urgentFiles.length > 0 && (
            <Alert className="mb-4">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>{urgentFiles.length} urgent studies</strong> detected that may require immediate attention.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Report Configuration */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Template Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Template</CardTitle>
            <CardDescription>Choose a pre-configured report template</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedTemplate.id} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Report Sections</Label>
              {customSections.map((section) => (
                <div key={section.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={section.id}
                    checked={section.enabled}
                    onCheckedChange={(checked) => handleSectionToggle(section.id, !!checked)}
                  />
                  <Label htmlFor={section.id} className="text-sm">
                    {section.title}
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    {section.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Format Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Export Format</CardTitle>
            <CardDescription>Choose the output format for your report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedFormat} onValueChange={(value: ReportFormat) => setSelectedFormat(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">HTML Report</span>
                    <span className="text-xs text-muted-foreground">Interactive web report with charts</span>
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">CSV Export</span>
                    <span className="text-xs text-muted-foreground">Spreadsheet-compatible data</span>
                  </div>
                </SelectItem>
                <SelectItem value="json">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">JSON Data</span>
                    <span className="text-xs text-muted-foreground">Machine-readable structured data</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Enabled Sections ({customSections.filter((s) => s.enabled).length})
              </Label>
              <div className="flex flex-wrap gap-1">
                {customSections
                  .filter((s) => s.enabled)
                  .map((section) => (
                    <Badge key={section.id} variant="outline" className="text-xs">
                      {section.title}
                    </Badge>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Report */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Generate Report</h3>
              <p className="text-sm text-muted-foreground">
                Create a {selectedFormat.toUpperCase()} report using the {selectedTemplate.name} template
              </p>
            </div>
            <div className="flex items-center gap-2">
              {generatedReport && (
                <>
                  <Button variant="outline" onClick={previewReport}>
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button variant="outline" onClick={downloadReport}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </>
              )}
              <Button
                onClick={generateReport}
                disabled={isGenerating || files.length === 0}
                className="bg-primary hover:bg-primary/90"
              >
                {isGenerating ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
