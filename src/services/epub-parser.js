/**
 * EPUB Parser Service
 * Extracts content, chapters, and metadata from EPUB files
 */

import JSZip from 'jszip';

/**
 * Parse an EPUB file and extract its contents
 * @param {File} file - The EPUB file to parse
 * @returns {Promise<Object>} Parsed book data
 */
export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(file);

  // Step 1: Find the OPF file location from container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) {
    throw new Error('Invalid EPUB: Missing container.xml');
  }

  const opfPath = getOpfPath(containerXml);
  if (!opfPath) {
    throw new Error('Invalid EPUB: Cannot find OPF file path');
  }

  // Step 2: Parse the OPF file
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error('Invalid EPUB: Cannot read OPF file');
  }

  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const { metadata, spine, manifest, coverId } = parseOpf(opfContent);

  // Step 3: Extract cover image if available
  const coverUrl = await extractCover(zip, manifest, coverId, opfDir);

  // Step 4: Extract chapters in spine order
  const chapters = await extractChapters(zip, spine, manifest, opfDir);

  return {
    metadata: {
      ...metadata,
      coverUrl,
    },
    chapters,
    totalWords: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
  };
}

/**
 * Extract OPF file path from container.xml
 * @param {string} containerXml - The container.xml content
 * @returns {string|null} The OPF file path
 */
function getOpfPath(containerXml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(containerXml, 'application/xml');
  const rootfile = doc.querySelector('rootfile');
  return rootfile?.getAttribute('full-path') || null;
}

/**
 * Parse the OPF file for metadata, manifest, and spine
 * @param {string} opfContent - The OPF file content
 * @returns {Object} Parsed OPF data
 */
function parseOpf(opfContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfContent, 'application/xml');

  // Extract metadata
  const metadata = {
    title: getMetadataValue(doc, 'title') || 'Untitled',
    author: getMetadataValue(doc, 'creator') || 'Unknown Author',
    language: getMetadataValue(doc, 'language') || 'en',
  };

  // Build manifest map (id -> href)
  const manifest = new Map();
  doc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (id && href) {
      manifest.set(id, { href, mediaType });
    }
  });

  // Get spine order (list of itemref idref values)
  const spine = [];
  doc.querySelectorAll('spine > itemref').forEach((itemref) => {
    const idref = itemref.getAttribute('idref');
    if (idref && manifest.has(idref)) {
      spine.push(idref);
    }
  });

  // Find cover image ID
  const coverId = findCoverId(doc, manifest);

  return { metadata, spine, manifest, coverId };
}

/**
 * Find the cover image ID from OPF metadata or manifest
 * @param {Document} doc - The OPF document
 * @param {Map} manifest - The manifest map
 * @returns {string|null} Cover item ID
 */
function findCoverId(doc, manifest) {
  // Method 1: Look for meta name="cover" content="cover-id"
  const coverMeta = doc.querySelector('metadata > meta[name="cover"]');
  if (coverMeta) {
    const coverId = coverMeta.getAttribute('content');
    if (coverId && manifest.has(coverId)) {
      return coverId;
    }
  }

  // Method 2: Look for item with properties="cover-image"
  const coverItem = doc.querySelector('manifest > item[properties*="cover-image"]');
  if (coverItem) {
    return coverItem.getAttribute('id');
  }

  // Method 3: Look for item with id containing "cover" and image type
  for (const [id, item] of manifest) {
    if (
      id.toLowerCase().includes('cover') &&
      item.mediaType?.startsWith('image/')
    ) {
      return id;
    }
  }

  return null;
}

/**
 * Extract cover image as a data URL
 * @param {JSZip} zip - The ZIP instance
 * @param {Map} manifest - The manifest map
 * @param {string|null} coverId - The cover item ID
 * @param {string} opfDir - Directory containing the OPF file
 * @returns {Promise<string|null>} Cover image data URL or null
 */
async function extractCover(zip, manifest, coverId, opfDir) {
  if (!coverId) return null;

  const coverItem = manifest.get(coverId);
  if (!coverItem || !coverItem.mediaType?.startsWith('image/')) {
    return null;
  }

  const filePath = opfDir + coverItem.href;
  const imageData = await zip.file(filePath)?.async('base64');

  if (!imageData) return null;

  return `data:${coverItem.mediaType};base64,${imageData}`;
}

/**
 * Get a metadata value from the OPF document
 * @param {Document} doc - The OPF document
 * @param {string} name - The metadata element name
 * @returns {string|null} The metadata value
 */
function getMetadataValue(doc, name) {
  // Try both dc: prefixed and non-prefixed
  const element =
    doc.querySelector(`metadata > dc\\:${name}`) ||
    doc.querySelector(`metadata > *[name="${name}"]`) ||
    doc.querySelector(`metadata ${name}`);
  return element?.textContent?.trim() || null;
}

/**
 * Extract chapters from the EPUB in spine order
 * @param {JSZip} zip - The ZIP instance
 * @param {string[]} spine - Array of manifest IDs in reading order
 * @param {Map} manifest - Map of manifest IDs to href/mediaType
 * @param {string} opfDir - Directory containing the OPF file
 * @returns {Promise<Array>} Array of chapter objects
 */
async function extractChapters(zip, spine, manifest, opfDir) {
  const chapters = [];

  for (let i = 0; i < spine.length; i++) {
    const id = spine[i];
    const item = manifest.get(id);

    if (!item) continue;

    // Only process HTML/XHTML content
    if (
      !item.mediaType?.includes('html') &&
      !item.href.endsWith('.html') &&
      !item.href.endsWith('.xhtml')
    ) {
      continue;
    }

    const filePath = opfDir + item.href;
    const content = await zip.file(filePath)?.async('text');

    if (!content) continue;

    const { text, title } = extractTextFromHtml(content);

    if (text.trim()) {
      chapters.push({
        id,
        title: title || `Chapter ${chapters.length + 1}`,
        text,
        wordCount: countWords(text),
      });
    }
  }

  return chapters;
}

/**
 * Extract plain text from HTML content
 * @param {string} html - The HTML content
 * @returns {Object} Object with text and optional title
 */
function extractTextFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try to get chapter title from h1, h2, or title
  const title =
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('h2')?.textContent?.trim() ||
    doc.querySelector('title')?.textContent?.trim() ||
    null;

  // Remove script and style elements
  doc.querySelectorAll('script, style, nav, aside').forEach((el) => el.remove());

  // Get text content from body
  const body = doc.body || doc.documentElement;
  const text = body?.textContent || '';

  // Clean up whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();

  return { text: cleanText, title };
}

/**
 * Count words in text
 * @param {string} text - The text to count words in
 * @returns {number} Word count
 */
function countWords(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}
