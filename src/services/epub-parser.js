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
  const { metadata, spine, manifest, coverId, ncxId } = parseOpf(opfContent);

  // Step 3: Extract cover image if available
  const coverUrl = await extractCover(zip, manifest, coverId, opfDir);

  // Step 4: Parse NCX for navigation structure
  const navPoints = await parseNcx(zip, manifest, ncxId, opfDir);

  // Step 5: Extract chapters using NCX navigation or spine fallback
  const chapters = await extractChaptersWithNav(zip, spine, manifest, opfDir, navPoints);

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

  // Find NCX file ID from spine toc attribute
  const spineEl = doc.querySelector('spine');
  const ncxId = spineEl?.getAttribute('toc') || null;

  return { metadata, spine, manifest, coverId, ncxId };
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
 * Parse NCX file to get navigation points
 * @param {JSZip} zip - The ZIP instance
 * @param {Map} manifest - The manifest map
 * @param {string|null} ncxId - NCX file ID from spine
 * @param {string} opfDir - Directory containing the OPF file
 * @returns {Promise<Array>} Array of navigation points
 */
async function parseNcx(zip, manifest, ncxId, opfDir) {
  if (!ncxId) return [];

  const ncxItem = manifest.get(ncxId);
  if (!ncxItem) return [];

  const ncxPath = opfDir + ncxItem.href;
  const ncxContent = await zip.file(ncxPath)?.async('text');
  if (!ncxContent) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(ncxContent, 'application/xml');

  const navPoints = [];

  // Parse navPoints recursively
  function parseNavPoint(element, depth = 0) {
    const label = element.querySelector(':scope > navLabel > text')?.textContent?.trim();
    const src = element.querySelector(':scope > content')?.getAttribute('src');

    if (label && src) {
      // Parse src to get file and optional fragment
      const [file, fragment] = src.split('#');
      navPoints.push({
        label,
        file,
        fragment: fragment || null,
        depth,
      });
    }

    // Parse nested navPoints
    element.querySelectorAll(':scope > navPoint').forEach((child) => {
      parseNavPoint(child, depth + 1);
    });
  }

  // Start from navMap
  const navMap = doc.querySelector('navMap');
  if (navMap) {
    navMap.querySelectorAll(':scope > navPoint').forEach((navPoint) => {
      parseNavPoint(navPoint, 0);
    });
  }

  return navPoints;
}

/**
 * Extract chapters using NCX navigation or fallback to spine
 * @param {JSZip} zip - The ZIP instance
 * @param {string[]} spine - Array of manifest IDs in reading order
 * @param {Map} manifest - Map of manifest IDs to href/mediaType
 * @param {string} opfDir - Directory containing the OPF file
 * @param {Array} navPoints - Navigation points from NCX
 * @returns {Promise<Array>} Array of chapter objects
 */
async function extractChaptersWithNav(zip, spine, manifest, opfDir, navPoints) {
  // If we have meaningful navigation (more than 1 entry), use it
  if (navPoints.length > 1) {
    return await extractChaptersFromNav(zip, opfDir, navPoints);
  }

  // Fall back to spine-based extraction
  return await extractChapters(zip, spine, manifest, opfDir);
}

/**
 * Extract chapters based on NCX navigation points
 * @param {JSZip} zip - The ZIP instance
 * @param {string} opfDir - Directory containing the OPF file
 * @param {Array} navPoints - Navigation points from NCX
 * @returns {Promise<Array>} Array of chapter objects
 */
async function extractChaptersFromNav(zip, opfDir, navPoints) {
  const chapters = [];

  // Group navPoints by file
  const fileContents = new Map();

  for (const navPoint of navPoints) {
    const filePath = opfDir + navPoint.file;

    // Load file content if not already loaded
    if (!fileContents.has(filePath)) {
      const content = await zip.file(filePath)?.async('text');
      if (content) {
        fileContents.set(filePath, content);
      }
    }
  }

  // Extract text for each navigation point
  for (let i = 0; i < navPoints.length; i++) {
    const navPoint = navPoints[i];
    const nextNavPoint = navPoints[i + 1];
    const filePath = opfDir + navPoint.file;
    const content = fileContents.get(filePath);

    if (!content) continue;

    let text = '';

    if (navPoint.fragment) {
      // Extract from fragment to next fragment or end
      text = extractTextFromFragment(
        content,
        navPoint.fragment,
        nextNavPoint?.file === navPoint.file ? nextNavPoint.fragment : null
      );
    } else {
      // No fragment - check if next navPoint is in same file
      if (nextNavPoint && nextNavPoint.file === navPoint.file && nextNavPoint.fragment) {
        // Extract from start to next fragment
        text = extractTextFromFragment(content, null, nextNavPoint.fragment);
      } else {
        // Extract entire file or until next file
        const { text: fullText } = extractTextFromHtml(content);
        text = fullText;
      }
    }

    if (text.trim()) {
      chapters.push({
        id: `nav-${i}`,
        title: navPoint.label,
        text: text.trim(),
        wordCount: countWords(text),
      });
    }
  }

  // If navigation-based extraction yields nothing useful, fall back
  if (chapters.length === 0 || chapters.every((ch) => ch.wordCount < 10)) {
    return [];
  }

  return chapters;
}

/**
 * Extract text from HTML content between fragments
 * @param {string} html - The HTML content
 * @param {string|null} startFragment - Starting element ID (null = start of document)
 * @param {string|null} endFragment - Ending element ID (null = end of document)
 * @returns {string} Extracted text
 */
function extractTextFromFragment(html, startFragment, endFragment) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove script and style elements
  doc.querySelectorAll('script, style, nav, aside').forEach((el) => el.remove());

  const body = doc.body || doc.documentElement;
  if (!body) return '';

  // If no fragments, return all text
  if (!startFragment && !endFragment) {
    const text = body.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  // Find start and end elements
  const startEl = startFragment ? doc.getElementById(startFragment) : null;
  const endEl = endFragment ? doc.getElementById(endFragment) : null;

  // Collect text nodes between start and end
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
  let collecting = !startFragment; // Start collecting if no start fragment
  let text = '';

  let node;
  while ((node = walker.nextNode())) {
    // Check if we've reached the start element
    if (startEl && !collecting) {
      if (startEl.contains(node) || isAfterElement(node, startEl)) {
        collecting = true;
      }
    }

    // Check if we've reached the end element
    if (endEl && collecting) {
      if (endEl.contains(node) || isAfterElement(node, endEl)) {
        break;
      }
    }

    if (collecting) {
      text += node.textContent + ' ';
    }
  }

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a node comes after an element in document order
 * @param {Node} node - The node to check
 * @param {Element} element - The reference element
 * @returns {boolean} True if node is after element
 */
function isAfterElement(node, element) {
  const comparison = element.compareDocumentPosition(node);
  return (comparison & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * Extract chapters from the EPUB in spine order (fallback method)
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
        title: title || `Part ${chapters.length + 1}`,
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

  // Try to get chapter title from various sources
  let title = null;

  // First try h1, h2, h3
  const heading =
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('h2')?.textContent?.trim() ||
    doc.querySelector('h3')?.textContent?.trim();

  if (heading && isValidTitle(heading)) {
    title = heading;
  }

  // If no valid heading, try title tag (but skip generic ones)
  if (!title) {
    const titleTag = doc.querySelector('title')?.textContent?.trim();
    if (titleTag && isValidTitle(titleTag)) {
      title = titleTag;
    }
  }

  // Remove script and style elements
  doc.querySelectorAll('script, style, nav, aside').forEach((el) => el.remove());

  // Get text content from body
  const body = doc.body || doc.documentElement;
  const text = body?.textContent || '';

  // Clean up whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // If still no title, try to extract from first meaningful paragraph
  if (!title && cleanText) {
    const firstLine = cleanText.split(/[.!?]/, 1)[0].trim();
    // Use first line as title if it's short enough (likely a chapter title)
    if (firstLine.length > 0 && firstLine.length <= 50 && !firstLine.includes(' ')) {
      title = firstLine;
    }
  }

  return { text: cleanText, title };
}

/**
 * Check if a title is valid (not a placeholder or generic)
 * @param {string} title - The title to check
 * @returns {boolean} True if valid
 */
function isValidTitle(title) {
  if (!title || title.length === 0) return false;

  // List of common placeholder/generic titles to skip
  const invalidTitles = [
    'unknown',
    'nieznany',
    'untitled',
    'chapter',
    'section',
    'part',
    'index',
    'content',
    'document',
  ];

  const lower = title.toLowerCase();
  return !invalidTitles.some((invalid) => lower === invalid || lower.startsWith(invalid + ' '));
}

/**
 * Count words in text
 * @param {string} text - The text to count words in
 * @returns {number} Word count
 */
function countWords(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}
