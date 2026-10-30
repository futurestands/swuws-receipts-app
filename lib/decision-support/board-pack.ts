import JSZip from "jszip"
import { TrustedPerformanceDataset } from "./types"
import { displayMeasurement } from "./display"

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const targetSummary = (d: TrustedPerformanceDataset) => d.referenceTargets
  ? d.referenceTargets.slice(0, 2).map(t => `${xml(t.schemeName)}: original TPS production ${t.result.production.value ?? "Unresolved"} m³; sales ${t.result.sold.value ?? "Unresolved"} m³; billing ${t.result.billing.value ?? "Unresolved"} UGX; demand ${t.result.demand.value ?? "Unresolved external arrears"}`).join("; ")
  : `Persisted production target: ${d.kpis.targetProductionM3 == null ? "Unresolved / partial coverage" : d.kpis.targetProductionM3.toLocaleString() + " m³"}. Original workbook targets are not live approvals.`

const productionValue = (d: TrustedPerformanceDataset) => d.production?.available === false ? "Unavailable: no verified observations" : d.kpis.waterProducedM3.toLocaleString()
const capacityValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false ? "Unavailable: unconfirmed configuration" : d.kpis.practicalCapacityM3Month.toLocaleString()
const utilizationValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false || d.production?.available === false || d.kpis.practicalCapacityM3Month <= 0 ? "Unavailable" : `${d.kpis.capacityUtilizationPercent}%`

export async function generateBoardPackPptx(
  dataset: TrustedPerformanceDataset
): Promise<Buffer> {
  const zip = new JSZip()

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

  // 5. Theme &amp; Slide Layouts
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

  // Individual Slide Relationship files linking slide to slideLayout
  for (let i = 1; i <= 14; i++) {
    const slideRelXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, slideRelXml)
  }

  // Build Distinct Slide Contents
  const slideContentBuilders: ((dataset: TrustedPerformanceDataset) => string)[] = [
    // Slide 1: Title
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1371600"/><a:ext cx="7772400" cy="1828800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3600" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>SWUWS Board Performance Review</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="0284C7"/></a:solidFill></a:rPr><a:t>Reporting Period: ${xml(ds.period.periodName)}</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1400"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>South Western Umbrella of Water and Sanitation</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 2: Exec Summary
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Executive Summary — ${xml(ds.period.periodName)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Water Production: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${productionValue(ds)} m³ produced (${utilizationValue(ds)} capacity utilisation).</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Billed Consumption Sales: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${displayMeasurement(ds.kpis.waterSoldM3, ds.availability?.sales)} m³ billed sales.</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600" bold="1"/><a:t>• Production-to-Sales Loss Indicator: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${ds.kpis.displayLossIndicator}.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 3: Overall Performance Dashboard
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Overall Performance Dashboard — ${xml(ds.period.periodName)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Total Water Produced: ${productionValue(ds)} m³</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Total Water Sold: ${displayMeasurement(ds.kpis.waterSoldM3, ds.availability?.sales)} m³</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Practical Monthly Capacity: ${capacityValue(ds)} m³</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 4: Production vs Target
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Production Performance vs Approved TPS Targets</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Total Production: ${productionValue(ds)} m³</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• ${targetSummary(ds)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 5: Capacity Utilisation
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Capacity Utilisation &amp; System Health</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Practical Monthly Capacity: ${capacityValue(ds)} m³</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Capacity Utilisation Rate: ${utilizationValue(ds)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 6: Supply, Sales &amp; Loss
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Water Supply, Sales &amp; Loss Indicator Analysis</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Production: ${productionValue(ds)} m³, Sales: ${displayMeasurement(ds.kpis.waterSoldM3, ds.availability?.sales)} m³</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Raw Production-to-Sales Loss Indicator: ${ds.kpis.displayLossIndicator}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 7: Commercial Performance
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Commercial Performance (Billing &amp; Cash)</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Current Billed Demand: ${displayMeasurement(ds.kpis.currentBilledUgx, ds.availability?.billing, "currency")}</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Total Cash Collected: ${displayMeasurement(ds.kpis.totalCashCollectedUgx, ds.availability?.collections, "currency")} (${displayMeasurement(ds.kpis.collectionEfficiencyPercent, ds.availability?.collections, "percent")})</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 8: Arrears
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Customer Debt &amp; Arrears Position</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Outstanding Demand (includes current bills): ${displayMeasurement(ds.kpis.totalArrearsUgx, ds.availability?.arrears, "currency")}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 9: Scheme Performance Matrix (Actual Scheme Rows)
    (ds) => {
      const topRows = ds.schemesMatrix.slice(0, 5).map((s) => `• ${xml(s.schemeName)}: Prod ${s.productionAvailable === false ? "Unavailable" : s.producedM3.toLocaleString()} m³, Util ${s.capacityAvailable === false || s.productionAvailable === false || s.practicalCapacityM3 <= 0 ? "Unavailable" : `${s.utilizationPercent}%`}, Loss ${s.displayLoss}`).join("\n")
      return `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Dynamic Scheme Performance Matrix (${ds.schemesMatrix.length} Schemes)</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${topRows || "• Scheme matrix active"}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    },

    // Slide 10: What Changed? (Period Deltas)
    (ds) => {
      const deltasText = ds.periodDeltas.slice(0, 4).map((d) => `• ${xml(d.summary)}`).join("\n") || "• Period-over-period comparison active."
      return `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>What Changed? Period-over-Period Deltas</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${deltasText}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    },

    // Slide 11: Management Attention
    () => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Management Attention Items &amp; Anomalies</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Validated operational and commercial exceptions requiring review.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 12: Action Register Summary
    () => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Open Management Action Register Summary</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• No open management actions recorded for this reporting scope.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 13: Data Quality Limitations
    (ds) => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Data Quality &amp; Reporting Limitations</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Verified day coverage: ${ds.basis === "historical_workbook" ? "Unresolved" : ds.dataQuality.completenessPercent + "%"}. Not all-source completeness. Legacy and unverified records excluded. ${ds.basis === "historical_workbook" ? "Capacity is the original fixed-month workbook benchmark; assessment dates unresolved." : "Capacity uses confirmed current configuration, not historical installed capacity."}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,

    // Slide 14: Governance Conclusion
    () => `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Governance Position &amp; Conclusion</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Summary derived from trusted Decision Support engine dataset.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  ]

  for (let i = 1; i <= 14; i++) {
    const slideXml = slideContentBuilders[i - 1](dataset)
    zip.file(`ppt/slides/slide${i}.xml`, slideXml)
  }

  // Generate binary PPTX buffer
  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return buffer
}
