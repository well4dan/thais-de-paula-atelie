// Gerador nativo de arquivos .ZIP (PKZIP 2.0) em streaming, sem dependências externas
// Empacota as fotos originais de um pedido + LEIAME-PEDIDO.txt enviando cada arquivo assim que é lido do banco.
// - Método STORE (0): JPG/PNG/WebP já são comprimidos, recomprimir só gastaria CPU
// - Bit 3 (data descriptor): o CRC vai depois dos bytes, então nada precisa ficar inteiro na memória
// - Tamanho final calculado antes de começar, o navegador mostra o progresso real do download

import { crc32 } from "node:zlib";

const LOCAL_HEADER_SIZE = 30;
const DATA_DESCRIPTOR_SIZE = 16;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const FLAGS = 0x0008 | 0x0800; // bit 3 = data descriptor, bit 11 = nomes em UTF-8
const MAX_ZIP32_BYTES = 0xffffffff;
// Quantas fotos à frente são buscadas no banco enquanto a atual é enviada (memória máxima = 1 + LOOKAHEAD fotos)
const LOOKAHEAD = 2;

export class ZipIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.code = "ZIP_INTEGRITY";
  }
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function encodeEntryName(name) {
  return Buffer.from(String(name).replace(/^\/+/, ""), "utf8");
}

/**
 * Tamanho exato do .ZIP para entradas [{ name, size }], usado no Content-Length.
 */
export function predictZipSize(entries) {
  let total = END_RECORD_SIZE;
  for (const entry of entries) {
    const nameLength = encodeEntryName(entry.name).length;
    total += LOCAL_HEADER_SIZE + nameLength + entry.size + DATA_DESCRIPTOR_SIZE;
    total += CENTRAL_HEADER_SIZE + nameLength;
  }
  return total;
}

function buildLocalHeader(nameBuf, stamp) {
  const header = Buffer.alloc(LOCAL_HEADER_SIZE);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(FLAGS, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(stamp.dosTime, 10);
  header.writeUInt16LE(stamp.dosDate, 12);
  // CRC e tamanhos ficam zerados aqui e seguem no data descriptor (bit 3)
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function buildDataDescriptor(crc, size) {
  const descriptor = Buffer.alloc(DATA_DESCRIPTOR_SIZE);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(size, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
}

function buildCentralHeader({ nameBuf, crc, size, offset }, stamp) {
  const header = Buffer.alloc(CENTRAL_HEADER_SIZE);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(FLAGS, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(stamp.dosTime, 12);
  header.writeUInt16LE(stamp.dosDate, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt32LE(offset, 42);
  return header;
}

function buildEndRecord(entryCount, centralSize, centralOffset) {
  const record = Buffer.alloc(END_RECORD_SIZE);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  return record;
}

function writeChunk(output, chunk) {
  if (output.destroyed) throw new ZipIntegrityError("Conexão encerrada durante o envio do .ZIP.");
  if (output.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      output.off("close", onClose);
      resolve();
    };
    const onClose = () => {
      output.off("drain", onDrain);
      reject(new ZipIntegrityError("Conexão encerrada durante o envio do .ZIP."));
    };
    output.once("drain", onDrain);
    output.once("close", onClose);
  });
}

/**
 * Escreve o .ZIP em `output` (ex.: http.ServerResponse) lendo os arquivos sob demanda, com leitura antecipada curta.
 * entries: [{ name, size, load: async () => Buffer }]. `size` precisa bater com os bytes reais,
 * pois o Content-Length já foi enviado; se não bater, aborta em vez de entregar arquivo corrompido.
 */
export async function streamZip(output, entries, now = new Date()) {
  if (predictZipSize(entries) > MAX_ZIP32_BYTES || entries.length > 0xffff) {
    throw new ZipIntegrityError("Pacote grande demais para o formato ZIP padrão.");
  }
  const stamp = dosDateTime(now);
  const written = [];
  const loads = new Array(entries.length);
  const startLoad = (index) => {
    if (index >= entries.length || loads[index]) return;
    loads[index] = Promise.resolve().then(() => entries[index].load());
    loads[index].catch(() => {}); // erro tratado no await abaixo; evita rejeição solta se o envio abortar antes
  };
  let offset = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    for (let ahead = 0; ahead <= LOOKAHEAD; ahead += 1) startLoad(index + ahead);
    const nameBuf = encodeEntryName(entry.name);
    const data = await loads[index];
    loads[index] = true; // libera a referência ao Buffer já enviado
    if (!Buffer.isBuffer(data) || data.length !== entry.size) {
      throw new ZipIntegrityError(`Tamanho divergente no arquivo ${entry.name}.`);
    }
    const crc = crc32(data);
    await writeChunk(output, buildLocalHeader(nameBuf, stamp));
    await writeChunk(output, nameBuf);
    await writeChunk(output, data);
    await writeChunk(output, buildDataDescriptor(crc, data.length));
    written.push({ nameBuf, crc, size: data.length, offset });
    offset += LOCAL_HEADER_SIZE + nameBuf.length + data.length + DATA_DESCRIPTOR_SIZE;
  }

  const centralParts = [];
  for (const item of written) {
    centralParts.push(buildCentralHeader(item, stamp), item.nameBuf);
  }
  const centralDir = Buffer.concat(centralParts);
  await writeChunk(output, centralDir);
  await writeChunk(output, buildEndRecord(written.length, centralDir.length, offset));
}
