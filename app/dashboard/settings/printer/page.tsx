import { PrinterSettingsClient } from "./PrinterSettingsClient"

export const dynamic = "force-dynamic"

export default function PrinterSettingsPage() {
  return (
    <div className="container mx-auto py-6">
      <PrinterSettingsClient />
    </div>
  )
}
