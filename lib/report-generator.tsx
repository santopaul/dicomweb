import type { DicomMetadata, ProcessingOptions } from "./dicom-processor"

export interface ReportData {
  files: ProcessedFileData[]
  summary: ReportSummary
  processingOptions: ProcessingOptions
  generatedAt: string
  reportId: string
}

export interface ProcessedFileData {
  fileName: string
  fileSize: number
  metadata: DicomMetadata
  processingTime: number
  status: "success" | "error"
  error?: string
}

export interface ReportSummary {
  totalFiles: number
  successfulFiles: number
  failedFiles: number
  totalProcessingTime: number
  urgentStudies: number
  phiDetected: number
  anonymizedFiles: number
  modalities: Record<string, number>
  bodyParts: Record<string, number>
  manufacturers: Record<string, number>
}

export type ReportFormat = "pdf" | "csv" | "json" | "html"

export interface ReportTemplate {
  id: string
  name: string
  description: string
  sections: ReportSection[]
}

export interface ReportSection {
  id: string
  title: string
  type: "summary" | "table" | "chart" | "metadata" | "compliance"
  enabled: boolean
  config?: Record<string, any>
}

export const DEFAULT_TEMPLATES: ReportTemplate[] = [
  {
    id: "clinical",
    name: "Clinical Report",
    description: "Focused on patient care and clinical decision making",
    sections: [
      { id: "summary", title: "Executive Summary", type: "summary", enabled: true },
      { id: "urgent", title: "Urgent Studies", type: "table", enabled: true },
      { id: "phi", title: "PHI Compliance", type: "compliance", enabled: true },
      { id: "modalities", title: "Study Distribution", type: "chart", enabled: true },
    ],
  },
  {
    id: "technical",
    name: "Technical Report",
    description: "Detailed technical metadata and processing information",
    sections: [
      { id: "summary", title: "Processing Summary", type: "summary", enabled: true },
      { id: "metadata", title: "Technical Metadata", type: "metadata", enabled: true },
      { id: "equipment", title: "Equipment Analysis", type: "table", enabled: true },
      { id: "performance", title: "Processing Performance", type: "chart", enabled: true },
    ],
  },
  {
    id: "compliance",
    name: "Compliance Report",
    description: "Privacy and regulatory compliance focused",
    sections: [
      { id: "phi", title: "PHI Analysis", type: "compliance", enabled: true },
      { id: "anonymization", title: "Anonymization Status", type: "table", enabled: true },
      { id: "private-tags", title: "Private Tags", type: "table", enabled: true },
      { id: "audit", title: "Audit Trail", type: "table", enabled: true },
    ],
  },
]

export function generateReportData(files: ProcessedFileData[], processingOptions: ProcessingOptions): ReportData {
  const summary = generateSummary(files)

  return {
    files,
    summary,
    processingOptions,
    generatedAt: new Date().toISOString(),
    reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
  }
}

function generateSummary(files: ProcessedFileData[]): ReportSummary {
  const successfulFiles = files.filter((f) => f.status === "success")
  const failedFiles = files.filter((f) => f.status === "error")

  const modalities: Record<string, number> = {}
  const bodyParts: Record<string, number> = {}
  const manufacturers: Record<string, number> = {}

  let urgentStudies = 0
  let phiDetected = 0
  let anonymizedFiles = 0

  successfulFiles.forEach((file) => {
    const { metadata } = file

    // Count modalities
    modalities[metadata.modality] = (modalities[metadata.modality] || 0) + 1

    // Count body parts
    bodyParts[metadata.body_part_examined] = (bodyParts[metadata.body_part_examined] || 0) + 1

    // Count manufacturers
    manufacturers[metadata.manufacturer] = (manufacturers[metadata.manufacturer] || 0) + 1

    // Count urgent studies
    if (metadata.urgent) urgentStudies++

    // Count PHI detected
    if (metadata.phi_flags.length > 0) phiDetected++

    // Count anonymized files
    if (metadata.phi_removed === "YES") anonymizedFiles++
  })

  return {
    totalFiles: files.length,
    successfulFiles: successfulFiles.length,
    failedFiles: failedFiles.length,
    totalProcessingTime: files.reduce((sum, f) => sum + f.processingTime, 0),
    urgentStudies,
    phiDetected,
    anonymizedFiles,
    modalities,
    bodyParts,
    manufacturers,
  }
}

export function generateHTMLReport(data: ReportData, template: ReportTemplate): string {
  const { files, summary, processingOptions, generatedAt, reportId } = data

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${template.name} - ${reportId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e9ecef; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #212529; font-size: 28px; }
        .header .meta { color: #6c757d; margin-top: 8px; font-size: 14px; }
        .section { margin-bottom: 40px; }
        .section h2 { color: #495057; border-bottom: 1px solid #dee2e6; padding-bottom: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #007bff; }
        .summary-card h3 { margin: 0 0 8px 0; font-size: 14px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #212529; }
        .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        .table th { background: #f8f9fa; font-weight: 600; color: #495057; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-info { background: #d1ecf1; color: #0c5460; }
        .alert { padding: 15px; border-radius: 6px; margin-bottom: 20px; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${template.name}</h1>
            <div class="meta">
                Report ID: ${reportId} | Generated: ${new Date(generatedAt).toLocaleString()} | Files Processed: ${summary.totalFiles}
            </div>
        </div>

        ${template.sections
          .filter((s) => s.enabled)
          .map((section) => {
            switch (section.type) {
              case "summary":
                return generateSummarySection(summary, processingOptions)
              case "compliance":
                return generateComplianceSection(summary, files)
              case "table":
                return generateTableSection(section, files, summary)
              case "metadata":
                return generateMetadataSection(files)
              default:
                return ""
            }
          })
          .join("")}

        <div class="footer">
            <p>This report was generated by DICOM Web Processing Tool. Processing completed with ${summary.successfulFiles} successful and ${summary.failedFiles} failed files.</p>
        </div>
    </div>
</body>
</html>`

  return html
}

function generateSummarySection(summary: ReportSummary, options: ProcessingOptions): string {
  return `
    <div class="section">
        <h2>Processing Summary</h2>
        <div class="summary-grid">
            <div class="summary-card">
                <h3>Total Files</h3>
                <div class="value">${summary.totalFiles}</div>
            </div>
            <div class="summary-card">
                <h3>Successful</h3>
                <div class="value" style="color: #28a745;">${summary.successfulFiles}</div>
            </div>
            <div class="summary-card">
                <h3>Failed</h3>
                <div class="value" style="color: #dc3545;">${summary.failedFiles}</div>
            </div>
            <div class="summary-card">
                <h3>Processing Time</h3>
                <div class="value">${(summary.totalProcessingTime / 1000).toFixed(1)}s</div>
            </div>
            <div class="summary-card">
                <h3>Urgent Studies</h3>
                <div class="value" style="color: ${summary.urgentStudies > 0 ? "#dc3545" : "#28a745"};">${summary.urgentStudies}</div>
            </div>
            <div class="summary-card">
                <h3>Anonymized</h3>
                <div class="value" style="color: #007bff;">${summary.anonymizedFiles}</div>
            </div>
        </div>
        
        ${
          options.anonymize
            ? `
        <div class="alert alert-warning">
            <strong>Anonymization Applied:</strong> Files processed with ${options.anonymize_mode} mode. 
            ${options.remove_private_tags ? "Private tags removed." : "Private tags preserved."}
        </div>
        `
            : ""
        }
        
        ${
          summary.phiDetected > 0 && !options.anonymize
            ? `
        <div class="alert alert-danger">
            <strong>PHI Detected:</strong> ${summary.phiDetected} files contain PHI that was not anonymized.
        </div>
        `
            : ""
        }
    </div>`
}

function generateComplianceSection(summary: ReportSummary, files: ProcessedFileData[]): string {
  const phiFiles = files.filter((f) => f.status === "success" && f.metadata.phi_flags.length > 0)

  return `
    <div class="section">
        <h2>Privacy & Compliance Analysis</h2>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>PHI Detected</h3>
                <div class="value" style="color: ${summary.phiDetected > 0 ? "#dc3545" : "#28a745"};">${summary.phiDetected}</div>
            </div>
            <div class="summary-card">
                <h3>Anonymized Files</h3>
                <div class="value" style="color: #007bff;">${summary.anonymizedFiles}</div>
            </div>
            <div class="summary-card">
                <h3>Compliance Rate</h3>
                <div class="value" style="color: ${summary.phiDetected === 0 ? "#28a745" : "#dc3545"};">
                    ${summary.totalFiles > 0 ? Math.round(((summary.totalFiles - summary.phiDetected) / summary.totalFiles) * 100) : 100}%
                </div>
            </div>
        </div>

        ${
          phiFiles.length > 0
            ? `
        <h3>Files with PHI Detected</h3>
        <table class="table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>PHI Fields</th>
                    <th>Anonymized</th>
                </tr>
            </thead>
            <tbody>
                ${phiFiles
                  .map(
                    (file) => `
                <tr>
                    <td>${file.fileName}</td>
                    <td>${file.metadata.phi_flags.map((flag) => `<span class="badge badge-warning">${flag}</span>`).join(" ")}</td>
                    <td><span class="badge ${file.metadata.phi_removed === "YES" ? "badge-success" : "badge-danger"}">${file.metadata.phi_removed}</span></td>
                </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
        `
            : "<p>No PHI detected in processed files.</p>"
        }
    </div>`
}

function generateTableSection(section: ReportSection, files: ProcessedFileData[], summary: ReportSummary): string {
  switch (section.id) {
    case "urgent":
      const urgentFiles = files.filter((f) => f.status === "success" && f.metadata.urgent)
      return `
        <div class="section">
            <h2>Urgent Studies</h2>
            ${
              urgentFiles.length > 0
                ? `
            <table class="table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Patient</th>
                        <th>Modality</th>
                        <th>Body Part</th>
                        <th>Urgent Reasons</th>
                    </tr>
                </thead>
                <tbody>
                    ${urgentFiles
                      .map(
                        (file) => `
                    <tr>
                        <td>${file.fileName}</td>
                        <td>${file.metadata.patient_name}</td>
                        <td><span class="badge badge-info">${file.metadata.modality}</span></td>
                        <td>${file.metadata.body_part_examined}</td>
                        <td>${file.metadata.urgent_reasons.join(", ")}</td>
                    </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
            `
                : "<p>No urgent studies found.</p>"
            }
        </div>`

    case "equipment":
      return `
        <div class="section">
            <h2>Equipment Analysis</h2>
            <table class="table">
                <thead>
                    <tr>
                        <th>Manufacturer</th>
                        <th>Count</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(summary.manufacturers)
                      .map(
                        ([manufacturer, count]) => `
                    <tr>
                        <td>${manufacturer}</td>
                        <td>${count}</td>
                        <td>${Math.round((count / summary.successfulFiles) * 100)}%</td>
                    </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>`

    default:
      return ""
  }
}

function generateMetadataSection(files: ProcessedFileData[]): string {
  const successfulFiles = files.filter((f) => f.status === "success")

  return `
    <div class="section">
        <h2>Technical Metadata Summary</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Modality</th>
                    <th>Dimensions</th>
                    <th>Slice Thickness</th>
                    <th>Manufacturer</th>
                    <th>Processing Time</th>
                </tr>
            </thead>
            <tbody>
                ${successfulFiles
                  .map(
                    (file) => `
                <tr>
                    <td>${file.fileName}</td>
                    <td><span class="badge badge-info">${file.metadata.modality}</span></td>
                    <td>${file.metadata.rows} × ${file.metadata.columns}</td>
                    <td>${file.metadata.slice_thickness} mm</td>
                    <td>${file.metadata.manufacturer}</td>
                    <td>${file.processingTime}ms</td>
                </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    </div>`
}

export function generateCSVReport(data: ReportData): string {
  const { files } = data
  const successfulFiles = files.filter((f) => f.status === "success")

  const headers = [
    "File Name",
    "Status",
    "Processing Time (ms)",
    "Patient ID",
    "Patient Name",
    "Age",
    "Sex",
    "Modality",
    "Body Part",
    "Study Description",
    "Study Date",
    "Manufacturer",
    "Model",
    "Urgent",
    "PHI Removed",
    "PHI Flags",
  ]

  const rows = files.map((file) => [
    file.fileName,
    file.status,
    file.processingTime.toString(),
    file.status === "success" ? file.metadata.patient_id : "",
    file.status === "success" ? file.metadata.patient_name : "",
    file.status === "success" ? file.metadata.patient_age : "",
    file.status === "success" ? file.metadata.patient_sex : "",
    file.status === "success" ? file.metadata.modality : "",
    file.status === "success" ? file.metadata.body_part_examined : "",
    file.status === "success" ? file.metadata.study_description : "",
    file.status === "success" ? file.metadata.study_date_time : "",
    file.status === "success" ? file.metadata.manufacturer : "",
    file.status === "success" ? file.metadata.model : "",
    file.status === "success" ? (file.metadata.urgent ? "YES" : "NO") : "",
    file.status === "success" ? file.metadata.phi_removed : "",
    file.status === "success" ? file.metadata.phi_flags.join(";") : "",
  ])

  return [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n")
}

export function generateJSONReport(data: ReportData): string {
  return JSON.stringify(data, null, 2)
}
