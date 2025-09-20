import { FileUpload } from "@/components/file-upload"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BatchProcessingDashboard } from "@/components/batch-processing-dashboard"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">DICOM Processing Platform</h1>
            <p className="text-lg text-muted-foreground text-pretty max-w-2xl mx-auto">
              Professional medical imaging metadata extraction, anonymization, and batch processing for researchers and
              engineers.
            </p>
          </div>

          {/* Main Upload Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                Upload DICOM Files
              </CardTitle>
              <CardDescription>
                Upload individual DICOM files or entire directories for batch processing. All data is processed securely
                with optional anonymization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload />
            </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Metadata Extraction</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Extract comprehensive metadata including patient information, study details, and technical parameters.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Anonymization</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Secure PHI removal with pseudonymization options and salt-based hashing for reproducibility.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Batch Processing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Multi-threaded processing of large DICOM collections with progress tracking and export options.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Batch Processing Dashboard */}
          <BatchProcessingDashboard />
        </div>
      </div>
    </div>
  )
}
