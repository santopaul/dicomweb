// DICOM processing utilities converted from Python CLI tool
export interface DicomMetadata {
  // STAT (critical) metadata
  patient_id: string
  patient_name: string
  patient_age: string
  patient_sex: string
  modality: string
  body_part_examined: string
  study_description: string
  study_date_time: string
  phi_removed: string

  // Full technical metadata
  manufacturer: string
  model: string
  software_versions: string
  magnetic_field_strength: string
  slice_thickness: string
  pixel_spacing: string
  rows: string
  columns: string
  photometric_interpretation: string
  study_instance_uid: string
  series_instance_uid: string
  transfer_syntax_uid: string
  number_of_frames?: number

  // Analysis flags
  phi_flags: string[]
  urgent: boolean
  urgent_reasons: string[]
  private_tags: PrivateTag[]
}

export interface PrivateTag {
  tag: string
  group: string
  element: string
  keyword: string
  name: string
  creator: string
  value_preview: string
}

export interface ProcessingOptions {
  anonymize: boolean
  anonymize_mode: "pseudonymize" | "remove"
  anonymize_tags?: string[]
  anonymize_salt?: string
  remove_private_tags: boolean
  output_formats: string[]
}

export interface ProcessingResult {
  success: boolean
  metadata?: DicomMetadata
  error?: string
  file_path: string
  processing_time: number
}

// Mock DICOM processing function (in real implementation, this would use a DICOM library)
export async function processDicomFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
  options: ProcessingOptions,
): Promise<ProcessingResult> {
  const startTime = Date.now()

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))

    // Mock metadata extraction (in real implementation, would parse DICOM headers)
    const mockMetadata: DicomMetadata = {
      patient_id: options.anonymize ? generatePseudonym("PATIENT_001", options.anonymize_salt) : "PATIENT_001",
      patient_name: options.anonymize ? generatePseudonym("John Doe", options.anonymize_salt) : "John Doe",
      patient_age: "45Y",
      patient_sex: "M",
      modality: getModalityFromFileName(fileName),
      body_part_examined: getBodyPartFromFileName(fileName),
      study_description: "Routine examination",
      study_date_time: new Date().toISOString(),
      phi_removed: options.anonymize ? "YES" : "NO",

      manufacturer: "SIEMENS",
      model: "SOMATOM Definition AS",
      software_versions: "syngo CT 2012B",
      magnetic_field_strength: "N/A",
      slice_thickness: "5.0",
      pixel_spacing: "[0.976562, 0.976562]",
      rows: "512",
      columns: "512",
      photometric_interpretation: "MONOCHROME2",
      study_instance_uid: generateUID(),
      series_instance_uid: generateUID(),
      transfer_syntax_uid: "1.2.840.10008.1.2.1",

      phi_flags: options.anonymize ? [] : ["PatientName", "PatientID"],
      urgent: checkUrgency(getModalityFromFileName(fileName), "Routine examination"),
      urgent_reasons: checkUrgency(getModalityFromFileName(fileName), "Routine examination")
        ? ["Routine screening"]
        : [],
      private_tags: [],
    }

    return {
      success: true,
      metadata: mockMetadata,
      file_path: fileName,
      processing_time: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown processing error",
      file_path: fileName,
      processing_time: Date.now() - startTime,
    }
  }
}

// Helper functions
function generatePseudonym(value: string, salt?: string): string {
  // Simple hash-based pseudonymization (in real implementation, use proper crypto)
  const actualSalt = salt || "default_salt"
  const hash = btoa(value + actualSalt).slice(0, 12)
  return `anon_${hash}`
}

function getModalityFromFileName(fileName: string): string {
  const name = fileName.toLowerCase()
  if (name.includes("ct")) return "CT"
  if (name.includes("mr") || name.includes("mri")) return "MR"
  if (name.includes("us")) return "US"
  if (name.includes("xr") || name.includes("dx")) return "DX"
  return "CT" // Default
}

function getBodyPartFromFileName(fileName: string): string {
  const name = fileName.toLowerCase()
  if (name.includes("head") || name.includes("brain")) return "HEAD"
  if (name.includes("chest") || name.includes("thorax")) return "CHEST"
  if (name.includes("abdomen") || name.includes("pelvis")) return "ABDOMEN"
  return "CHEST" // Default
}

function generateUID(): string {
  return `1.2.840.10008.${Date.now()}.${Math.floor(Math.random() * 1000000)}`
}

function checkUrgency(modality: string, description: string): boolean {
  const urgentKeywords = ["trauma", "stroke", "emergency", "stat", "urgent"]
  return (
    urgentKeywords.some((keyword) => description.toLowerCase().includes(keyword)) ||
    (modality === "CT" && description.toLowerCase().includes("head"))
  )
}

export async function processBatchFiles(
  files: { buffer: ArrayBuffer; name: string }[],
  options: ProcessingOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const result = await processDicomFile(file.buffer, file.name, options)
    results.push(result)

    if (onProgress) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}
