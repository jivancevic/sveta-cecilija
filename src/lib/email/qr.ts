import QRCode from 'qrcode'

export async function generateQrPng(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, { type: 'png', margin: 1, width: 320 })
}
