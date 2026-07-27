# SWUWS Safe Export Utility
# Prepares a deployment/audit archive by removing sensitive files and build artifacts.

$ExportDir = "SWUWS_Export_$(Get-Date -Format 'yyyyMMdd_HHmm')"
New-Item -ItemType Directory -Path $ExportDir

Write-Host "Copying project files..."
Copy-Item -Path ".*", "app", "components", "db", "docs", "lib", "public", "scripts", "package.json", "package-lock.json", "tsconfig.json", "next.config.mjs", "drizzle.config.ts" -Destination $ExportDir -Recurse -Exclude "node_modules", ".next", ".git", ".idea", ".artifacts"

Write-Host "Removing sensitive artifacts..."
$SensitiveFiles = @(".env", ".env.local", "server_log.txt", "npm-debug.log")
foreach ($file in $SensitiveFiles) {
    if (Test-Path "$ExportDir/$file") {
        Remove-Item "$ExportDir/$file" -Force
        Write-Host "Removed: $file"
    }
}

Write-Host "SUCCESS: Safe export created in $ExportDir"
Write-Host "You can now zip this directory for sharing."
