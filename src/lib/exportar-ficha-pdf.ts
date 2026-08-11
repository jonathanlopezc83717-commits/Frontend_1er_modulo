import {
  type TxtOpts,
  resolverLabel,
  formatearCoordenadas,
  calcularDistribucionEvidencias,
  formatoImagen,
  obtenerDimensionesImagen,
  calcularAjusteContain,
  procesarLogo,
} from './exportar-ficha-utils'

export async function exportarPdfFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
  opciones: { quitarFondoLogos?: boolean; numEvidencias?: number } = {},
  etiquetas?: Record<string, string>,
  camposCustom: ReadonlyArray<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }> = [],
  escribirEn?: (nombre: string, blob: Blob) => Promise<void>,
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const d = valores
  const quitarFondo = opciones.quitarFondoLogos ?? false
  const numEvidencias = opciones.numEvidencias ?? 3

  const ML = 8
  const MT = 8
  const PW = 210 - ML * 2
  const PH = 297 - MT * 2

  const C = [30, 24, 28, 24, 40, 48]
  const CX: number[] = [ML]
  for (let i = 1; i <= 6; i++) CX.push(CX[i - 1] + C[i - 1])

  const Htitle = 20
  const Hsub = 8
  const Hdata = 8
  const HestLbl = 7
  const HestVal = 35
  const HcrLbl = 7
  const HcrVal = 55
  const HevLbl = 7
  const HevVal = 65

  let y = MT
  const Ytitle = y; y += Htitle
  const Ysub = y; y += Hsub
  const dataRows = [
    { v: ['1-B', '1-D', '1-F'] },
  ]
  const Ydata: number[] = []
  for (let i = 0; i < dataRows.length; i++) { Ydata.push(y); y += Hdata }
  const filasCustom = Math.ceil(camposCustom.length / 3)
  const Ycustom: number[] = []
  for (let i = 0; i < filasCustom; i++) { Ycustom.push(y); y += Hdata }
  const YestLbl = y; y += HestLbl
  const YestVal = y; y += HestVal
  const YcrLbl = y; y += HcrLbl
  const YcrVal = y; y += HcrVal
  const YevLbl = y; y += HevLbl
  const YevVal = y; y += HevVal

  if (y > MT + PH + 2) {

    console.warn('El contenido del formato excede una página A4')
  }

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)

  const cell = (x: number, yy: number, w: number, h: number, bg?: number[]) => {
    if (bg) {
      doc.setFillColor(bg[0], bg[1], bg[2])
      doc.rect(x, yy, w, h, 'FD')
    } else {
      doc.rect(x, yy, w, h)
    }
  }

  const txt = (text: string, x: number, yy: number, w: number, opts: TxtOpts = {}) => {
    if (!text) return
    const fs = opts.fs || 7.5
    const style = opts.bold ? 'bold' : 'normal'
    const align = opts.align || 'left'
    const color = opts.color || [0, 0, 0]
    const px = opts.px || 2
    const h = opts.h || Hdata

    doc.setFontSize(fs)
    doc.setFont('helvetica', style)
    doc.setTextColor(color[0], color[1], color[2])

    const lines = doc.splitTextToSize(String(text), w - px * 2)

    let textX: number
    if (align === 'center') {
      textX = x + w / 2
    } else if (align === 'right') {
      textX = x + w - px
    } else {
      textX = x + px
    }

    if (opts.vcenter) {
      const lineH = fs * 0.3528
      const totalH = lines.length * lineH
      const startY = yy + h / 2 - totalH / 2 + lineH
      doc.text(lines, textX, startY, { align })
    } else {
      doc.text(lines, textX, yy + (opts.py || 2.5), { align })
    }
  }

  cell(ML, Ytitle, PW, Htitle, [26, 26, 26])

  const logoZoneW = PW * 0.25
  const tituloZoneX = ML + logoZoneW
  const tituloZoneW = PW * 0.5
  const logoMaxH = Htitle - 4

  if (imagenes['logo-izq']) {
    try {
      const logoIzq = await procesarLogo(imagenes['logo-izq'], quitarFondo)
      const dim = await obtenerDimensionesImagen(logoIzq)
      const fit = calcularAjusteContain(dim.w, dim.h, logoZoneW, logoMaxH)
      doc.addImage(
        logoIzq,
        formatoImagen(logoIzq),
        ML + (logoZoneW - fit.w) / 2,
        Ytitle + (Htitle - fit.h) / 2,
        fit.w,
        fit.h,
      )
    } catch { /* ignorar */ }
  }

  if (imagenes['logo-der']) {
    try {
      const logoDer = await procesarLogo(imagenes['logo-der'], quitarFondo)
      const dim = await obtenerDimensionesImagen(logoDer)
      const fit = calcularAjusteContain(dim.w, dim.h, logoZoneW, logoMaxH)
      const derZoneX = ML + PW - logoZoneW
      doc.addImage(
        logoDer,
        formatoImagen(logoDer),
        derZoneX + (logoZoneW - fit.w) / 2,
        Ytitle + (Htitle - fit.h) / 2,
        fit.w,
        fit.h,
      )
    } catch { /* ignorar */ }
  }

  txt(resolverLabel('sec:titulo', etiquetas), tituloZoneX, Ytitle, tituloZoneW, {
    fs: 10, bold: true, color: [255, 255, 255], align: 'center', vcenter: true, py: 0, h: Htitle,
  })

  cell(ML, Ysub, CX[4] - ML, Hsub, [45, 45, 45])
  txt(resolverLabel('sec:proyecto', etiquetas), ML, Ysub, CX[4] - ML, {
    fs: 8, color: [255, 255, 255], vcenter: true, py: 0, h: Hsub,
  })
  cell(CX[4], Ysub, C[4], Hsub, [240, 241, 243])
  txt(resolverLabel('sec:clave', etiquetas), CX[4], Ysub, C[4], { fs: 7.5, bold: true, align: 'right', vcenter: true, py: 0, h: Hsub })
  cell(CX[5], Ysub, C[5], Hsub)
  txt(d['0-F'] || '', CX[5], Ysub, C[5], { fs: 7.5, vcenter: true, py: 0, h: Hsub })

  dataRows.forEach((row, ri) => {
    const yy = Ydata[ri]
    for (let p = 0; p < 3; p++) {
      const lx = CX[p * 2]
      const vx = CX[p * 2 + 1]
      const lbl = resolverLabel(row.v[p], etiquetas) + ':'
      cell(lx, yy, C[p * 2], Hdata, [240, 241, 243])
      const lblFS = lbl.length > 28 ? 6.5 : 7.5
      txt(lbl, lx, yy, C[p * 2], { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
      cell(vx, yy, C[p * 2 + 1], Hdata)
      txt(d[row.v[p]] || '', vx, yy, C[p * 2 + 1], { fs: 7.5, vcenter: true, py: 0, h: Hdata })
    }
  })

  for (let fi = 0; fi < filasCustom; fi++) {
    const yy = Ycustom[fi]
    const chunk = camposCustom.slice(fi * 3, fi * 3 + 3)
    const M = chunk.length
    if (M === 3) {
      for (let p = 0; p < 3; p++) {
        const lx = CX[p * 2]
        const vx = CX[p * 2 + 1]
        cell(lx, yy, C[p * 2], Hdata, [240, 241, 243])
        cell(vx, yy, C[p * 2 + 1], Hdata)
        const campo = chunk[p]
        const lbl = campo.etiqueta + ':'
        const lblFS = lbl.length > 28 ? 6.5 : 7.5
        txt(lbl, lx, yy, C[p * 2], { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
        txt(campo.coordenadas ? formatearCoordenadas(d[campo.coord] || '') : (d[campo.coord] || ''), vx, yy, C[p * 2 + 1], { fs: 7.5, vcenter: true, py: 0, h: Hdata })
      }
    } else {
      const cellW = PW / M
      const labelW = cellW * 0.4
      const valorW = cellW * 0.6
      for (let p = 0; p < M; p++) {
        const lx = ML + p * cellW
        const vx = lx + labelW
        cell(lx, yy, labelW, Hdata, [240, 241, 243])
        cell(vx, yy, valorW, Hdata)
        const campo = chunk[p]
        const lbl = campo.etiqueta + ':'
        const lblFS = lbl.length > 28 ? 6.5 : 7.5
        txt(lbl, lx, yy, labelW, { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
        txt(campo.coordenadas ? formatearCoordenadas(d[campo.coord] || '') : (d[campo.coord] || ''), vx, yy, valorW, { fs: 7.5, vcenter: true, py: 0, h: Hdata })
      }
    }
  }

  cell(ML, YestLbl, CX[3] - ML, HestLbl, [240, 241, 243])
  txt(resolverLabel('sec:estado-izq', etiquetas), ML, YestLbl, CX[3] - ML, {
    fs: 7, bold: true, vcenter: true, py: 0, h: HestLbl,
  })
  cell(CX[3], YestLbl, CX[6] - CX[3], HestLbl, [240, 241, 243])
  txt(resolverLabel('sec:estado-der', etiquetas), CX[3], YestLbl, CX[6] - CX[3], {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HestLbl,
  })

  cell(ML, YestVal, CX[3] - ML, HestVal)
  txt(d['7-D'] || '', ML, YestVal, CX[3] - ML, { fs: 7, py: 2.5, h: HestVal })
  cell(CX[3], YestVal, CX[6] - CX[3], HestVal)
  txt(d['7-F'] || '', CX[3], YestVal, CX[6] - CX[3], { fs: 7, py: 2.5, h: HestVal })

  cell(ML, YcrLbl, CX[3] - ML, HcrLbl, [240, 241, 243])
  txt(resolverLabel('sec:croquis', etiquetas), ML, YcrLbl, CX[3] - ML, {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HcrLbl,
  })
  cell(CX[3], YcrLbl, CX[6] - CX[3], HcrLbl, [240, 241, 243])
  txt(resolverLabel('sec:observaciones', etiquetas), CX[3], YcrLbl, CX[6] - CX[3], {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HcrLbl,
  })

  const crW = CX[3] - ML
  const obsW = CX[6] - CX[3]
  cell(ML, YcrVal, crW, HcrVal)
  if (imagenes.croquis) {
    try {
      const dim = await obtenerDimensionesImagen(imagenes.croquis)
      const fit = calcularAjusteContain(dim.w, dim.h, crW - 3, HcrVal - 3)
      doc.addImage(
        imagenes.croquis,
        formatoImagen(imagenes.croquis),
        ML + 1.5 + fit.offsetX,
        YcrVal + 1.5 + fit.offsetY,
        fit.w,
        fit.h,
      )
    } catch {
      doc.setFontSize(7)
      doc.setTextColor(180, 180, 180)
      doc.text('[Imagen de croquis]', ML + crW / 2 - 12, YcrVal + HcrVal / 2)
      doc.setTextColor(0, 0, 0)
    }
  } else {
    doc.setFontSize(7)
    doc.setTextColor(190, 190, 190)
    doc.text('[Sin imagen]', ML + crW / 2 - 10, YcrVal + HcrVal / 2)
    doc.setTextColor(0, 0, 0)
  }
  cell(CX[3], YcrVal, obsW, HcrVal)
  txt(d['8-F'] || '', CX[3], YcrVal, obsW, { fs: 7, py: 2.5, h: HcrVal })

  cell(ML, YevLbl, PW, HevLbl, [240, 241, 243])
  txt(resolverLabel('sec:evidencias', etiquetas), ML, YevLbl, PW, {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HevLbl,
  })

  const evTotal = Math.max(0, Math.min(numEvidencias, 12))
  const { cols: evCols, rows: evRows } = calcularDistribucionEvidencias(evTotal)
  const evSlotW = evCols > 0 ? PW / evCols : PW
  const evSlotH = evRows > 0 ? HevVal / evRows : HevVal
  const itemsUltimaFila = evTotal - (evRows - 1) * evCols
  const offsetUltimaFila = itemsUltimaFila < evCols ? Math.floor((evCols - itemsUltimaFila) / 2) : 0

  for (let i = 0; i < evTotal; i++) {
    const fila = Math.floor(i / evCols)
    const col = i % evCols
    const isUltimaFila = fila === evRows - 1
    const offset = isUltimaFila ? offsetUltimaFila : 0
    const ex = ML + (offset + col) * evSlotW
    const ey = YevVal + fila * evSlotH
    cell(ex, ey, evSlotW, evSlotH)
    const imgKey = `evid-${i}`
    if (imagenes[imgKey]) {
      try {
        const dim = await obtenerDimensionesImagen(imagenes[imgKey])
        const fit = calcularAjusteContain(dim.w, dim.h, evSlotW - 3, evSlotH - 3)
        doc.addImage(
          imagenes[imgKey],
          formatoImagen(imagenes[imgKey]),
          ex + 1.5 + fit.offsetX,
          ey + 1.5 + fit.offsetY,
          fit.w,
          fit.h,
        )
      } catch {
        doc.setFontSize(7)
        doc.setTextColor(190, 190, 190)
        doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, ey + evSlotH / 2)
        doc.setTextColor(0, 0, 0)
      }
    } else {
      doc.setFontSize(7)
      doc.setTextColor(190, 190, 190)
      doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, ey + evSlotH / 2)
      doc.setTextColor(0, 0, 0)
    }
    if (col < evCols - 1 && i < evTotal - 1) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.line(ex + evSlotW, ey, ex + evSlotW, ey + evSlotH)
    }
    if (fila < evRows - 1) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.line(ML, ey + evSlotH, ML + PW, ey + evSlotH)
    }
  }

  const nombrePdf = `${nombreArchivo}.pdf`
  if (escribirEn) {
    await escribirEn(nombrePdf, doc.output('blob'))
  } else {
    doc.save(nombrePdf)
  }
}
