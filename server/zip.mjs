// Gerador nativo de arquivos .ZIP (PKZIP) sem dependências externas
// Empacota todas as fotos originais de um pedido + resumo LEIAME-PEDIDO.txt para produção da arte

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Cria um Buffer .ZIP válido contendo múltiplos arquivos [{ name: string, data: Buffer }]
 * Usa método STORE (0) pois imagens JPG/PNG/WebP já são comprimidas na origem.
 */
export function buildZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime(new Date());

  for (const file of files) {
    const nameBuf = Buffer.from(String(file.name).replace(/^\/+/, ""), "utf8");
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local File Header (30 bytes + nome)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Assinatura PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // Versão necessária (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // Bit 11 = UTF-8 filename
    localHeader.writeUInt16LE(0, 8); // Método 0 = STORE (sem recompressão de imagem)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // Tamanho comprimido
    localHeader.writeUInt32LE(size, 22); // Tamanho original
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central Directory File Header (46 bytes + nome)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Assinatura PK\x01\x02
    centralHeader.writeUInt16LE(20, 4); // Versão criadora
    centralHeader.writeUInt16LE(20, 6); // Versão necessária
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(0, 10); // Método 0 = STORE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE(0, 38); // External attrs
    centralHeader.writeUInt32LE(offset, 42); // Offset do Local Header

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // Assinatura PK\x05\x06
  endRecord.writeUInt16LE(0, 4); // Número deste disco
  endRecord.writeUInt16LE(0, 6); // Disco de início do diretório central
  endRecord.writeUInt16LE(files.length, 8); // Entradas neste disco
  endRecord.writeUInt16LE(files.length, 10); // Total de entradas
  endRecord.writeUInt32LE(centralDirBuf.length, 12); // Tamanho do diretório central
  endRecord.writeUInt32LE(offset, 16); // Offset do início do diretório central
  endRecord.writeUInt16LE(0, 20); // Tamanho do comentário

  return Buffer.concat([...localParts, centralDirBuf, endRecord]);
}
