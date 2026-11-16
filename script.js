document.addEventListener('DOMContentLoaded', async () => {
  let rootDirHandle = null;
  let currentFileHandle = null;
  let saveTimeout = null;

  const editor = document.getElementById('editor');
  const titleInput = document.getElementById('doc-title');
  const emojiBtn = document.getElementById('doc-emoji');
  const wordCountDisplay = document.getElementById('word-count');
  const fileTree = document.getElementById('file-tree');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnNewFile = document.getElementById('btn-new-file');

  const bgPicker = document.getElementById('bg-picker');
  const bgHex = document.getElementById('bg-hex');
  const textPicker = document.getElementById('text-picker');
  const textHex = document.getElementById('text-hex');
  const accentPicker = document.getElementById('accent-picker');
  const accentHex = document.getElementById('accent-hex');
  const btnSaveTheme = document.getElementById('btn-save-theme');
  const customPresetsContainer = document.getElementById('custom-presets-container');
  
  const fontSizeDec = document.getElementById('font-size-dec');
  const fontSizeInc = document.getElementById('font-size-inc');
  const fontSizeDisplay = document.getElementById('font-size-display');
  let currentFontSize = 17;

  const leftSidebar = document.getElementById('left-sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const btnCollapseLeft = document.getElementById('btn-collapse-left');
  const btnExpandLeft = document.getElementById('btn-expand-left');
  const btnCollapseRight = document.getElementById('btn-collapse-right');
  const btnExpandRight = document.getElementById('btn-expand-right');

  btnCollapseLeft.addEventListener('click', () => leftSidebar.classList.add('collapsed'));
  btnExpandLeft.addEventListener('click', () => leftSidebar.classList.remove('collapsed'));
  btnCollapseRight.addEventListener('click', () => rightSidebar.classList.add('collapsed'));
  btnExpandRight.addEventListener('click', () => rightSidebar.classList.remove('collapsed'));

  // --- INDEXEDDB VOOR MAP ONTHOUDEN ---
  function getIDBConnection() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AtelierDB', 1);
      request.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('handles');
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveHandleToIDB(handle) {
    try {
      const db = await getIDBConnection();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'rootDir');
    } catch (err) {
      console.error('Kon map niet opslaan in IndexedDB:', err);
    }
  }

  async function getHandleFromIDB() {
    try {
      const db = await getIDBConnection();
      return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('rootDir');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  // --- 1. LOKALE MAP KOPPELEN & AUTOMATISCH HERSTELLEN ---
  let savedDirHandle = null;

  async function initFolder(handle) {
    rootDirHandle = handle;
    await renderFileTree();
    btnNewFile.removeAttribute('disabled');
    btnOpenFolder.textContent = '＋ Map';
  }

  try {
    savedDirHandle = await getHandleFromIDB();
    if (savedDirHandle) {
      if ((await savedDirHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        await initFolder(savedDirHandle);
      } else {
        btnOpenFolder.textContent = `↻ Open "${savedDirHandle.name}"`;
      }
    }
  } catch (e) {
    console.error('Geen gekoppelde map gevonden:', e);
  }

  btnOpenFolder.addEventListener('click', async () => {
    try {
      if (savedDirHandle && !rootDirHandle) {
        const perm = await savedDirHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await initFolder(savedDirHandle);
          return;
        }
      }
      rootDirHandle = await window.showDirectoryPicker();
      savedDirHandle = rootDirHandle;
      await saveHandleToIDB(rootDirHandle);
      await initFolder(rootDirHandle);
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  });

  async function renderFileTree() {
    fileTree.innerHTML = '';
    const treeFrag = await buildTree(rootDirHandle);
    fileTree.appendChild(treeFrag);
  }

  async function buildTree(dirHandle) {
    const container = document.createElement('div');
    container.className = 'folder-contents';

    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue;

      if (handle.kind === 'directory') {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'tree-item tree-folder';
        
        const folderName = document.createElement('div');
        folderName.className = 'folder-name';
        folderName.textContent = `📁 ${name}`;
        folderDiv.appendChild(folderName);

        const subContainer = await buildTree(handle);
        folderDiv.appendChild(subContainer);
        container.appendChild(folderDiv);
      } else if (handle.kind === 'file' && (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.html'))) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'tree-item';
        fileDiv.textContent = `📄 ${name}`;
        fileDiv.addEventListener('click', () => openFile(handle, fileDiv));
        container.appendChild(fileDiv);
      }
    }
    return container;
  }

  async function openFile(fileHandle, element) {
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    currentFileHandle = fileHandle;
    const file = await fileHandle.getFile();
    const text = await file.text();

    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
    
    let content = text;
    let emoji = '📄';
    const emojiMatch = text.match(/^<!--EMOJI:(.*?)-->\n/);
    if (emojiMatch) {
      emoji = emojiMatch[1];
      content = text.replace(emojiMatch[0], '');
    }
    
    emojiBtn.textContent = emoji;
    editor.innerHTML = content;
    editor.setAttribute('contenteditable', 'true');
    titleInput.removeAttribute('disabled');
    updateWordCount();
  }

  // --- EMOJI MODAL LOGICA ---
  const emojiModal = document.getElementById('emoji-modal');
  const closeEmojiModalBtn = document.getElementById('close-emoji-modal');

  emojiBtn.addEventListener('click', () => {
    if (!currentFileHandle) return;
    emojiModal.classList.add('open');
  });

  closeEmojiModalBtn.addEventListener('click', () => {
    emojiModal.classList.remove('open');
  });

  emojiModal.addEventListener('click', (e) => {
    if (e.target === emojiModal) {
      emojiModal.classList.remove('open');
    }
  });

  document.querySelectorAll('.emoji-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedEmoji = btn.textContent;
      emojiBtn.textContent = selectedEmoji;
      emojiModal.classList.remove('open');
      saveCurrentFile();
    });
  });

  // --- 2. NIEUWE NOTITIE MAKEN ---
  btnNewFile.addEventListener('click', async () => {
    if (!rootDirHandle) return;
    const rawName = prompt('Naam voor nieuwe notitie:', 'nieuwe-notitie');
    if (!rawName) return;
    
    const fileName = rawName.trim().endsWith('.txt') ? rawName.trim() : rawName.trim() + '.txt';

    try {
      const newFileHandle = await rootDirHandle.getFileHandle(fileName, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write('<!--EMOJI:📝-->\n');
      await writable.close();

      await renderFileTree();
      
      const items = fileTree.querySelectorAll('.tree-item');
      for (const item of items) {
        if (item.textContent.includes(fileName)) {
          item.click();
          break;
        }
      }
    } catch (err) {
      alert('Kon bestand niet aanmaken: ' + err.message);
    }
  });

  // --- 3. AUTOMATISCH OPSLAAN NAAR SCHIJF ---
  async function saveCurrentFile() {
    if (!currentFileHandle) return;
    try {
      const currentEmoji = emojiBtn.textContent || '📄';
      const fileContent = `<!--EMOJI:${currentEmoji}-->\n` + editor.innerHTML;
      
      const writable = await currentFileHandle.createWritable();
      await writable.write(fileContent);
      await writable.close();
    } catch (err) {
      console.error('Fout bij opslaan:', err);
    }
  }

  editor.addEventListener('input', () => {
    updateWordCount();
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentFile, 600);
  });

  titleInput.addEventListener('input', async () => {
    if (!currentFileHandle) return;
    await saveCurrentFile();
  });

  // --- 4. TEKSTOPMAAK, LINKS & TOOLBARS ---
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('click', () => {
      editor.focus();
      document.execCommand(btn.dataset.command, false, null);
    });
  });

  document.querySelectorAll('[data-block]').forEach(btn => {
    btn.addEventListener('click', () => {
      editor.focus();
      document.execCommand('formatBlock', false, btn.dataset.block);
    });
  });

// --- MARKER FUNCTIONALITEIT (VEILIG VOOR OPSOMMINGEN) ---
  document.getElementById('btn-highlight').addEventListener('click', () => {
    editor.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
      alert('Selecteer eerst een woord of zin in je tekst.');
      return;
    }

    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    
    // Check of we al binnen een bestaande highlight zitten (voor de toggle-functie)
    let highlightSpan = container.nodeType === 3 ? container.parentElement.closest('.text-highlight') : container.closest('.text-highlight');

    if (highlightSpan) {
      // ALS HET AL GEMARKEERD IS: Haal de markering netjes weg
      const parent = highlightSpan.parentNode;
      while (highlightSpan.firstChild) {
        parent.insertBefore(highlightSpan.firstChild, highlightSpan);
      }
      parent.removeChild(highlightSpan);
    } else {
      // ALS HET NOG NIET IS GEMARKEERD: Wikkel het strak inline in een span
      const span = document.createElement('span');
      span.className = 'text-highlight';
      
      try {
        // surroundContents werkt alleen als de selectie binnen één node/regel valt
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch (e) {
        // Fallback voor complexere selecties (bijv. over meerdere woorden)
        const selectedText = selection.toString();
        if (selectedText) {
          const newNode = document.createElement('span');
          newNode.className = 'text-highlight';
          newNode.textContent = selectedText;
          range.deleteContents();
          range.insertNode(newNode);
        }
      }
    }

    selection.removeAllRanges();
    saveCurrentFile();
  });

  // Robuuste link-functionaliteit voor tekstselectie óf Tip Box
  document.getElementById('btn-link').addEventListener('click', () => {
    editor.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === 3 ? container.parentElement : container;
    const callout = element ? element.closest('.notion-callout') : null;

    // Als de cursor in een Tip Box staat (zonder geselecteerde tekst): maak de hele box klikbaar
    if (callout && selection.isCollapsed) {
      const currentUrl = callout.getAttribute('data-href') || 'https://';
      const url = prompt('Link voor deze Tip Box (laat leeg om te verwijderen):', currentUrl);
      if (url === null) return;

      if (url.trim() === '' || url.trim() === 'https://') {
        callout.removeAttribute('data-href');
        callout.removeAttribute('title');
      } else {
        const finalUrl = url.startsWith('http://') || url.startsWith('https://') ? url.trim() : 'https://' + url.trim();
        callout.setAttribute('data-href', finalUrl);
        callout.setAttribute('title', `Open link: ${finalUrl}`);
      }
      saveCurrentFile();
      return;
    }

    // Als er tekst geselecteerd is: koppel een link aan de tekst
    if (!selection.isCollapsed) {
      const existingLink = element ? element.closest('a') : null;
      const currentUrl = existingLink ? existingLink.getAttribute('href') : 'https://';
      const url = prompt('Voer de URL in (laat leeg om link te verwijderen):', currentUrl);
      if (url === null) return;

      if (url.trim() === '' || url.trim() === 'https://') {
        document.execCommand('unlink', false, null);
      } else {
        const finalUrl = url.startsWith('http://') || url.startsWith('https://') ? url.trim() : 'https://' + url.trim();
        document.execCommand('createLink', false, finalUrl);
        
        // Zorg dat de gegenereerde link in een nieuw tabblad opent
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const node = sel.getRangeAt(0).commonAncestorContainer;
          const anchor = node.nodeType === 3 ? node.parentElement.closest('a') : node.closest('a');
          if (anchor) {
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('rel', 'noopener noreferrer');
          }
        }
      }
      saveCurrentFile();
    } else {
      alert('Selecteer eerst een stukje tekst om er een link van te maken, of klik in een Tip Box.');
    }
  });

  // Klikgedrag voor links en gelinkte Tip Boxes
  editor.addEventListener('click', (e) => {
    if (e.altKey) return; // Houd Alt ingedrukt om tekst aan te passen zonder dat de link opent

    const anchor = e.target.closest('a');
    if (anchor && anchor.href) {
      e.preventDefault();
      window.open(anchor.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const callout = e.target.closest('.notion-callout[data-href]');
    if (callout) {
      const url = callout.getAttribute('data-href');
      if (url) {
        e.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      editor.focus();
      if (e.shiftKey) {
        document.execCommand('outdent', false, null);
      } else {
        document.execCommand('indent', false, null);
      }
      saveCurrentFile();
    }
  });

  document.getElementById('btn-table').addEventListener('click', () => {
    editor.focus();
    const tableHTML = `
      <table>
        <thead><tr><th>Kolom 1</th><th>Kolom 2</th><th>Kolom 3</th></tr></thead>
        <tbody><tr><td>Cel</td><td>Cel</td><td>Cel</td></tr><tr><td>Cel</td><td>Cel</td><td>Cel</td></tr></tbody>
      </table>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, tableHTML);
    saveCurrentFile();
  });

  function getContrastingTextColor(hexColor) {
    let cleanHex = hexColor.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const r = parseInt(cleanHex.substr(0, 2), 16);
    const g = parseInt(cleanHex.substr(2, 2), 16);
    const b = parseInt(cleanHex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    return luminance < 128 ? '#F3D8C7' : '#1E1D1B';
  }

document.getElementById('btn-callout').addEventListener('click', () => {
    editor.focus();

    const calloutHTML = `
      <div class="notion-callout">
        <div class="notion-callout-content" contenteditable="true" data-placeholder="Schrijf hier je belangrijke punt of tip..."></div>
      </div>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, calloutHTML);
    saveCurrentFile();
  });

  const imageInput = document.getElementById('image-input');
  document.getElementById('btn-image').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      editor.focus();
      document.execCommand('insertHTML', false, `<img src="${event.target.result}" alt="Afbeelding"><p><br></p>`);
      saveCurrentFile();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // --- 5. VORMGEVING, KLEUREN & CUSTOM SFEREN ("Hallo" knoppen) ---
  function normalizeHex(value) {
    let hex = value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-Fa-f]{3}$/.test(hex)) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : null;
  }

  function updateBgColor(color, updateInput = true) {
    document.documentElement.style.setProperty('--bg-color', color);
    bgPicker.value = color;
    if (updateInput) bgHex.value = color;
    localStorage.setItem('atelier_bg', color);

    const metaThemeColor = document.getElementById('theme-color-meta');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    }
  }

  function updateTextColor(color, updateInput = true) {
    document.documentElement.style.setProperty('--text-color', color);
    textPicker.value = color;
    if (updateInput) textHex.value = color;
    localStorage.setItem('atelier_text', color);
  }

  function updateAccentColor(color, updateInput = true) {
    document.documentElement.style.setProperty('--accent-color', color);
    accentPicker.value = color;
    if (updateInput) accentHex.value = color;
    localStorage.setItem('atelier_accent', color);
  }

  function updateFontSize(sizePx, save = true) {
    if (sizePx < 12) sizePx = 12;
    if (sizePx > 28) sizePx = 28;

    currentFontSize = sizePx;
    document.documentElement.style.setProperty('--font-size-base', sizePx + 'px');
    fontSizeDisplay.textContent = sizePx + 'px';

    if (save) {
      localStorage.setItem('atelier_fontsize', sizePx);
    }
  }

  bgPicker.addEventListener('input', (e) => updateBgColor(e.target.value.toUpperCase()));
  textPicker.addEventListener('input', (e) => updateTextColor(e.target.value.toUpperCase()));
  accentPicker.addEventListener('input', (e) => updateAccentColor(e.target.value.toUpperCase()));

  bgHex.addEventListener('input', (e) => {
    const hex = normalizeHex(e.target.value);
    if (hex) updateBgColor(hex, false);
  });
  bgHex.addEventListener('blur', (e) => {
    bgHex.value = normalizeHex(e.target.value) || bgPicker.value.toUpperCase();
  });

  textHex.addEventListener('input', (e) => {
    const hex = normalizeHex(e.target.value);
    if (hex) updateTextColor(hex, false);
  });
  textHex.addEventListener('blur', (e) => {
    textHex.value = normalizeHex(e.target.value) || textPicker.value.toUpperCase();
  });

  accentHex.addEventListener('input', (e) => {
    const hex = normalizeHex(e.target.value);
    if (hex) updateAccentColor(hex, false);
  });
  accentHex.addEventListener('blur', (e) => {
    accentHex.value = normalizeHex(e.target.value) || accentPicker.value.toUpperCase();
  });

  fontSizeDec.addEventListener('click', () => updateFontSize(currentFontSize - 1, true));
  fontSizeInc.addEventListener('click', () => updateFontSize(currentFontSize + 1, true));

  // --- OPGESLAGEN SFEREN RENDEREN ---
  function getCustomThemes() {
    try {
      return JSON.parse(localStorage.getItem('atelier_custom_themes')) || [];
    } catch {
      return [];
    }
  }

  function renderCustomThemes() {
    customPresetsContainer.innerHTML = '';
    const themes = getCustomThemes();

    if (themes.length === 0) {
      customPresetsContainer.innerHTML = '<span style="font-size: 11px; opacity: 0.4;">Nog geen eigen sferen opgeslagen.</span>';
      return;
    }

    themes.forEach((theme, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-theme-wrapper';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-theme-btn';
      btn.style.backgroundColor = theme.bg;
      btn.style.color = theme.text;
      btn.innerHTML = `<span>Hallo</span><span class="theme-accent-dot" style="background-color: ${theme.accent};"></span>`;
      btn.title = `Achtergrond: ${theme.bg}, Tekst: ${theme.text}, Accent: ${theme.accent}`;
      
      btn.addEventListener('click', () => {
        updateBgColor(theme.bg);
        updateTextColor(theme.text);
        if (theme.accent) updateAccentColor(theme.accent);
      });

      const delBtn = document.createElement('span');
      delBtn.className = 'delete-theme';
      delBtn.textContent = '×';
      delBtn.title = 'Verwijder sfeer';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        themes.splice(index, 1);
        localStorage.setItem('atelier_custom_themes', JSON.stringify(themes));
        renderCustomThemes();
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(delBtn);
      customPresetsContainer.appendChild(wrapper);
    });
  }

  btnSaveTheme.addEventListener('click', () => {
    const themes = getCustomThemes();
    const newTheme = {
      bg: bgPicker.value.toUpperCase(),
      text: textPicker.value.toUpperCase(),
      accent: accentPicker.value.toUpperCase()
    };

    if (!themes.some(t => t.bg === newTheme.bg && t.text === newTheme.text && t.accent === newTheme.accent)) {
      themes.push(newTheme);
      localStorage.setItem('atelier_custom_themes', JSON.stringify(themes));
      renderCustomThemes();
    }
  });

  renderCustomThemes();

  // --- LETTERTYPE SELECTIE ---
  const fontDropdown = document.getElementById('font-dropdown');
  const fontTrigger = fontDropdown.querySelector('.custom-select-trigger');
  const fontTriggerText = document.getElementById('selected-font-name');
  const fontOptions = fontDropdown.querySelectorAll('.custom-option');
  let fontBeforeOpen = '';

  fontTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!fontDropdown.classList.contains('open')) {
      fontBeforeOpen = getComputedStyle(document.documentElement).getPropertyValue('--editor-font').trim();
    }
    fontDropdown.classList.toggle('open');
  });

  window.addEventListener('click', () => {
    fontDropdown.classList.remove('open');
  });

  fontOptions.forEach(option => {
    const fontValue = option.getAttribute('data-value');

    option.addEventListener('mouseenter', () => {
      document.documentElement.style.setProperty('--editor-font', fontValue);
    });

    option.addEventListener('mouseleave', () => {
      const activeOpt = fontDropdown.querySelector('.custom-option.selected');
      if (activeOpt) {
        document.documentElement.style.setProperty('--editor-font', activeOpt.getAttribute('data-value'));
      } else {
        document.documentElement.style.setProperty('--editor-font', fontBeforeOpen);
      }
    });

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      fontOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      fontTriggerText.textContent = option.textContent;
      document.documentElement.style.setProperty('--editor-font', fontValue);
      localStorage.setItem('atelier_font', fontValue);
      
      fontBeforeOpen = fontValue;
      fontDropdown.classList.remove('open');
    });
  });

  function loadSavedPreferences() {
    if (localStorage.getItem('atelier_bg')) updateBgColor(localStorage.getItem('atelier_bg'));
    if (localStorage.getItem('atelier_text')) updateTextColor(localStorage.getItem('atelier_text'));
    if (localStorage.getItem('atelier_accent')) updateAccentColor(localStorage.getItem('atelier_accent'));
    
    const savedFontSize = parseInt(localStorage.getItem('atelier_fontsize'), 10);
    if (!isNaN(savedFontSize)) {
      updateFontSize(savedFontSize, false);
    }
    
    const savedFont = localStorage.getItem('atelier_font') || "'Outfit', sans-serif";
    document.documentElement.style.setProperty('--editor-font', savedFont);
    fontOptions.forEach(opt => {
      if (opt.getAttribute('data-value') === savedFont) {
        opt.classList.add('selected');
        fontTriggerText.textContent = opt.textContent;
      }
    });
  }
  loadSavedPreferences();

  // --- 6. EXPORTEREN ALS .TXT ---
  document.getElementById('btn-download').addEventListener('click', () => {
    const title = titleInput.value.trim() || 'notitie';
    const blob = new Blob([editor.innerText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function updateWordCount() {
    const text = editor.innerText.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCountDisplay.textContent = `${words} ${words === 1 ? 'woord' : 'woorden'}`;
  }
});
