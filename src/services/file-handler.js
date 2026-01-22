/**
 * File Handler Service
 * Manages drag-drop and file picker functionality for EPUB files
 */

/**
 * Open file picker using File System Access API
 * Returns both file and handle for persistence
 * @returns {Promise<{file: File, handle: FileSystemFileHandle}|null>}
 */
export async function openFilePicker() {
  if (!('showOpenFilePicker' in window)) {
    return null;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'EPUB files',
          accept: { 'application/epub+zip': ['.epub'] },
        },
      ],
      multiple: false,
    });

    const file = await handle.getFile();
    return { file, handle };
  } catch (error) {
    if (error.name === 'AbortError') {
      // User cancelled - not an error
      return null;
    }
    throw error;
  }
}

/**
 * Initialize file handling with drag-drop and file picker
 * @param {Object} options
 * @param {HTMLElement} options.dropZone - The drop zone element
 * @param {HTMLInputElement} options.fileInput - The file input element
 * @param {HTMLButtonElement} options.pickerButton - The file picker button
 * @param {Function} options.onFile - Callback when a valid file is selected
 * @param {Function} options.onFileWithHandle - Callback that receives both file and handle (for FSAA)
 * @param {Function} options.onError - Callback when an error occurs
 */
export function initFileHandler({
  dropZone,
  fileInput,
  pickerButton,
  onFile,
  onFileWithHandle,
  onError,
}) {
  // File picker button click - try FSAA first, fallback to traditional input
  pickerButton.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent event from bubbling to dropZone

    if ('showOpenFilePicker' in window && onFileWithHandle) {
      try {
        const result = await openFilePicker();
        if (result) {
          handleFile(result.file, onFile, onError, onFileWithHandle, result.handle);
          return;
        }
        // User cancelled, do nothing
        return;
      } catch (error) {
        console.warn('FSAA picker failed, falling back:', error);
      }
    }

    // Fallback to traditional file input
    fileInput.click();
  });

  // File input change (traditional input, no handle)
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFile(file, onFile, onError, onFileWithHandle, null);
    }
    // Reset input so same file can be selected again
    fileInput.value = '';
  });

  // Drag and drop events
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove class if we're leaving the drop zone entirely
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file, onFile, onError, onFileWithHandle, null);
    }
  });

  // Click on drop zone also opens file picker
  dropZone.addEventListener('click', async (e) => {
    // Don't trigger if clicking the button itself
    if (e.target === pickerButton || pickerButton.contains(e.target)) {
      return;
    }

    // Try FSAA first, fallback to traditional input
    if ('showOpenFilePicker' in window && onFileWithHandle) {
      try {
        const result = await openFilePicker();
        if (result) {
          handleFile(result.file, onFile, onError, onFileWithHandle, result.handle);
          return;
        }
        // User cancelled, do nothing
        return;
      } catch (error) {
        console.warn('FSAA picker failed, falling back:', error);
      }
    }

    // Fallback to traditional file input
    fileInput.click();
  });
}

/**
 * Validate and process a file
 * @param {File} file - The file to process
 * @param {Function} onFile - Success callback (file only)
 * @param {Function} onError - Error callback
 * @param {Function} onFileWithHandle - Success callback with handle
 * @param {FileSystemFileHandle|null} handle - The file handle (if available)
 */
function handleFile(file, onFile, onError, onFileWithHandle, handle) {
  // Check file extension
  if (!file.name.toLowerCase().endsWith('.epub')) {
    onError(new Error('Invalid file type. Please select an EPUB file.'));
    return;
  }

  // Check MIME type (some browsers may not set this correctly)
  const validTypes = ['application/epub+zip', 'application/octet-stream', ''];
  if (!validTypes.includes(file.type)) {
    // Still allow if extension is correct
    console.warn('Unexpected MIME type:', file.type);
  }

  // Use the handle-aware callback if available and we have a handle
  if (onFileWithHandle && handle) {
    onFileWithHandle(file, handle);
  } else {
    onFile(file);
  }
}
