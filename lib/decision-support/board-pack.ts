import JSZip from "jszip"
import { TrustedPerformanceDataset } from "./types"
import { formatUGX } from "@/lib/format"

export async function generateBoardPackPptx(
  dataset: TrustedPerformanceDataset
): Promise<Buffer> {
  const zip = new JSZip()
  const periodName = dataset.period.periodName

  // 1. [Content_Types].xml - Register 14 slides
  let slideOverridesXml = ""
  let slideRelsXml = ""
  let slideIdLstXml = ""

  for (let i = 1; i <= 14; i++) {
    slideOverridesXml += `  <Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n`
    slideRelsXml += `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>\n`
    slideIdLstXml += `    <p:sldId id="${255 + i}" r:id="rId${i + 1}"/>\n`
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverridesXml}</Types>`
  zip.file("[Content_Types].xml", contentTypesXml)

  // 2. _rels/.rels
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  zip.file("_rels/.rels", relsXml)

  // 3. ppt/presentation.xml
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
${slideIdLstXml}  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  zip.file("ppt/presentation.xml", presentationXml)

  // 4. ppt/_rels/presentation.xml.rels
  const presentationRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRelsXml}</Relationships>`
  zip.file("ppt/_rels/presentation.xml.rels", presentationRelsXml)

  // 5. Theme & Layouts
  const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SWUWS Theme">
  <a:themeElements>
    <a:clrScheme name="SWUWS"><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="0284C7"/></a:accent1><a:accent2><a:srgbClr val="059669"/></a:accent2></a:clrScheme>
    <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`
  zip.file("ppt/theme/theme1.xml", themeXml)

  const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="accent1" folHlink="accent2"/>
</p:sldMaster>`
  zip.file("ppt/slideMasters/slideMaster1.xml", slideMasterXml)

  const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
  zip.file("ppt/slideLayouts/slideLayout1.xml", slideLayoutXml)

  // 6. Build 14 Populated Slides
  const slideTitles = [
    "SWUWS Board Performance Review",
    "Executive Performance Summary",
    "Overall Performance Dashboard",
    "Production Performance vs Target",
    "Capacity Utilisation & System Health",
    "Water Supply, Sales & Loss Indicator Analysis",
    "Commercial Performance (Billing & Cash)",
    "Customer Debt & Arrears Position",
    "Dynamic Scheme Performance Matrix",
    "What Changed? Period-over-Period Deltas",
    "Management Attention Items & Anomalies",
    "Open Management Action Register Summary",
    "Data Quality & Reporting Limitations",
    "Governance Position & Management Conclusion",
  ]

  for (let i = 1; i <= 14; i++) {
    const title = slideTitles[i - 1]
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${title} — ${periodName}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Metric Summary: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>Water Produced: ${dataset.kpis.waterProducedM3.toLocaleString()} m³, Billed Sales: ${dataset.kpis.waterSoldM3.toLocaleString()} m³.</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Capacity Utilisation: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${dataset.kpis.capacityUtilizationPercent}% against practical monthly capacity of ${dataset.kpis.practicalCapacityM3Month.toLocaleString()} m³.</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Commercial Financials: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>Billed demand: ${formatUGX(dataset.kpis.currentBilledUgx)}, Cash collected: ${formatUGX(dataset.kpis.totalCashCollectedUgx)} (${dataset.kpis.collectionEfficiencyPercent}% efficiency).</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Governance Conclusion: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>All values calculated from single trusted performance dataset for ${periodName}.</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
    zip.file(`ppt/slides/slide${i}.xml`, slideXml)
  }

  // Generate binary PPTX buffer
  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return buffer
}
