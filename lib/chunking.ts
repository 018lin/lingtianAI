export type TextChunk = {
  content: string;
  metadata: Record<string, string | number>;
};

const TARGET_CHARS = 1400;
const OVERLAP_CHARS = 180;

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkParagraphs(
  paragraphs: string[],
  baseMetadata: Record<string, string | number>
) {
  const cleanParagraphs = paragraphs.map(normalizeText).filter(Boolean);
  const chunks: TextChunk[] = [];
  let current = "";
  let paragraphStart = 1;

  cleanParagraphs.forEach((paragraph, index) => {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (current && next.length > TARGET_CHARS) {
      chunks.push({
        content: current,
        metadata: {
          ...baseMetadata,
          section: `段落 ${paragraphStart}-${index}`
        }
      });

      const overlap = current.slice(-OVERLAP_CHARS);
      current = `${overlap}\n\n${paragraph}`.trim();
      paragraphStart = index + 1;
      return;
    }

    current = next;
  });

  if (current) {
    chunks.push({
      content: current,
      metadata: {
        ...baseMetadata,
        section: `段落 ${paragraphStart}-${cleanParagraphs.length}`
      }
    });
  }

  return chunks;
}

export function chunkSpreadsheetRows(
  rows: string[],
  baseMetadata: Record<string, string | number>
) {
  const chunks: TextChunk[] = [];
  let currentRows: string[] = [];
  let currentLength = 0;
  let startRow = 1;

  rows.forEach((row, index) => {
    if (currentRows.length && currentLength + row.length > TARGET_CHARS) {
      chunks.push({
        content: currentRows.join("\n"),
        metadata: {
          ...baseMetadata,
          rowStart: startRow,
          rowEnd: index
        }
      });
      currentRows = [row];
      currentLength = row.length;
      startRow = index + 1;
      return;
    }

    currentRows.push(row);
    currentLength += row.length;
  });

  if (currentRows.length) {
    chunks.push({
      content: currentRows.join("\n"),
      metadata: {
        ...baseMetadata,
        rowStart: startRow,
        rowEnd: rows.length
      }
    });
  }

  return chunks;
}
