/**
 * Taking the work out of Command Centre.
 *
 * An operator reviewing a documentary script will want it in a word processor,
 * in an email, or on paper. Markdown covers the first two; `.docx` covers the
 * third properly, and it is built here rather than fetched from a library
 * because the alternative — an HTML file named `.doc` — opens with a warning
 * dialog in Word and is not what was asked for.
 *
 * The zip is written with stored (uncompressed) entries. Deflate would save
 * space on a file that is a few kilobytes of text; correct CRC32s and a correct
 * central directory are what make it a valid document, and those are the parts
 * worth getting right by hand.
 */

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

export function markdownFilename(title: string): string {
  return `${slug(title)}.md`;
}

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  );
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Markdown → WordprocessingML.
 *
 * Deliberately small: headings, paragraphs and blank lines are the whole
 * vocabulary a script needs. Anything richer would be a Markdown renderer
 * pretending to be a document converter.
 */
export function documentXml(markdown: string): string {
  const paragraphs: string[] = [];

  for (const line of markdown.split('\n')) {
    const text = line.trim();
    if (text.length === 0) {
      paragraphs.push('<w:p/>');
      continue;
    }
    const heading = text.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/><w:spacing w:before="${level === 1 ? 0 : 320}" w:after="160"/></w:pPr>` +
          `<w:r><w:rPr><w:b/><w:sz w:val="${level === 1 ? 40 : level === 2 ? 30 : 26}"/></w:rPr>` +
          `<w:t xml:space="preserve">${escapeXml(heading[2]!)}</w:t></w:r></w:p>`,
      );
      continue;
    }
    paragraphs.push(
      `<w:p><w:pPr><w:spacing w:after="180" w:line="300" w:lineRule="auto"/></w:pPr>` +
        `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

/** A `.docx` as bytes. Valid OOXML in a stored zip. */
export function buildDocx(markdown: string): Uint8Array {
  return zip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: RELS },
    { name: 'word/document.xml', content: documentXml(markdown) },
  ]);
}

/* ------------------------------------------------------------------ */
/* Zip                                                                 */
/* ------------------------------------------------------------------ */

interface ZipEntry {
  name: string;
  content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored-method zip. No compression, correct offsets, correct checksums. */
export function zip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // method: stored
    view.setUint16(10, 0, true); // time
    view.setUint16(12, 0x21, true); // date: 1 Jan 1980, fixed so output is stable
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central directory header
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total =
    locals.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
