import JSZip from "jszip"
import { TrustedPerformanceDataset } from "./types"
import { formatUGX } from "@/lib/format"

export async function generateBoardPackPptx(
  dataset: TrustedPerformanceDataset
): Promise<Buffer> {
  const zip = new JSZip()
  const periodName = dataset.period.periodName

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
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
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
    <p:sldId id="258" r:id="rId4"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  zip.file("ppt/presentation.xml", presentationXml)

  // 4. ppt/_rels/presentation.xml.rels
  const presentationRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`
  zip.file("ppt/_rels/presentation.xml.rels", presentationRelsXml)

  // 5. Minimal Theme & Layout XMLs
  const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SWUWS Theme">
  <a:themeElements>
    <a:clrScheme name="SWUWS">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:accent1><a:srgbClr val="0284C7"/></a:accent1>
      <a:accent2><a:srgbClr val="059669"/></a:accent2>
    </a:clrScheme>
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

  // 6. Individual Slides Content
  // Slide 1: Cover
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="685800" y="1371600"/><a:ext cx="7772400" cy="1828800"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3600" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>SWUWS Board Performance Review</a:t></a:r></a:p>
      <a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="0284C7"/></a:solidFill></a:rPr><a:t>Reporting Period: ${periodName}</a:t></a:r></a:p>
      <a:p><a:r><a:rPr lang="en-US" sz="1400"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:rPr><a:t>South Western Umbrella of Water and Sanitation</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  zip.file("ppt/slides/slide1.xml", slide1Xml)

  // Slide 2: Executive Summary
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Executive Performance Summary — ${periodName}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="en-US" sz="1800" bold="1"/><a:t>• Water Production: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${dataset.kpis.waterProducedM3.toLocaleString()} m³ produced across active schemes (${dataset.kpis.capacityUtilizationPercent}% capacity utilisation).</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1800" bold="1"/><a:t>• Commercial Billing: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Total current billed demand reached ${formatUGX(dataset.kpis.currentBilledUgx)}.</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1800" bold="1"/><a:t>• Cash Collections: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Total cash collected: ${formatUGX(dataset.kpis.totalCashCollectedUgx)} (${dataset.kpis.collectionEfficiencyPercent}% collection efficiency).</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1800" bold="1"/><a:t>• Water Loss Indicator: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Raw production-to-sales loss indicator: ${dataset.kpis.displayLossIndicator}.</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  zip.file("ppt/slides/slide2.xml", slide2Xml)

  // Slide 3: Overall Performance Table
  const slide3Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cSvPr id="1" name=""/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Header"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="685800"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" bold="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Key Governance Indicators — ${periodName}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="TableBox"/><p:txBox/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="457200" y="1219200"/><a:ext cx="8229600" cy="3429000"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Water Produced: ${dataset.kpis.waterProducedM3.toLocaleString()} m³</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Billed Sales: ${dataset.kpis.waterSoldM3.toLocaleString()} m³</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Live Customer Arrears: ${formatUGX(dataset.kpis.totalArrearsUgx)}</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>• Data Completeness: ${dataset.dataQuality.completenessPercent}%</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  zip.file("ppt/slides/slide3.xml", slide3Xml)

  // Generate binary PPTX buffer
  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return buffer
}
