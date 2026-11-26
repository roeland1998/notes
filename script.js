document.addEventListener('DOMContentLoaded', async () => {
  // --- GOOGLE DRIVE VIA APPS SCRIPT CONFIGURATIE ---
  const DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwCrUm_a5A7nYZLlTNPN2qsEYGSrC53WV7so7g-hgBMFn0ld8sKuiSKahlTmJMBSkiF9Q/exec';
  const DRIVE_API_TOKEN = 'API_Roeland_2026';

  let isDriveConnected = false;
  let currentFile = null; // { id, name }
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

  // --- 1. GOOGLE DRIVE KOPPELEN & BESTANDEN LADEN ---
  async function driveGet(params) {
    const url = new URL(DRIVE_SCRIPT_URL);
    url.searchParams.set('token', DRIVE_API_TOKEN);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Drive fout');
    return data;
  }

  async function drivePost(payload) {
    const url = new URL(DRIVE_SCRIPT_URL);
    url.searchParams.set('token', DRIVE_API_TOKEN);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Drive opslaan mislukt');
    return data;
  }

  async function initDriveFolder() {
    if (!DRIVE_SCRIPT_URL || DRIVE_SCRIPT_URL.startsWith('PLAK_HIER')) {
      alert('Vul eerst jouw Google Apps Script Web App URL in bovenaan script.js.');
      return;
    }

    const data = await driveGet({ action: 'list' });
    isDriveConnected = true;
    localStorage.setItem('atelier_drive_linked', '1');
    btnNewFile.removeAttribute('disabled');
    btnOpenFolder.textContent = '↻ Map';
    btnOpenFolder.title = `Verbonden met Drive-map: ${data.folderName}`;
    renderFileTree(data.items || []);
  }

  btnOpenFolder.addEventListener('click', async () => {
    try {
      btnOpenFolder.textContent = '⏳ Laden...';
      await initDriveFolder();
    } catch (err) {
      console.error('Kon Google Drive-map niet koppelen:', err);
      btnOpenFolder.textContent = '＋ Map';
      alert('Kon geen verbinding maken met Google Drive: ' + err.message);
    }
  });

  if (localStorage.getItem('atelier_drive_linked') === '1') {
    initDriveFolder().catch(() => {
      btnOpenFolder.textContent = '＋ Map';
    });
  }

  function renderFileTree(items) {
    fileTree.innerHTML = '';
    const treeFrag = buildTree(items);
    fileTree.appendChild(treeFrag);
  }

  function buildTree(items) {
    const container = document.createElement('div');
    container.className = 'folder-contents';

    for (const item of items) {
      if (item.kind === 'directory') {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'tree-item tree-folder';

        const folderName = document.createElement('div');
        folderName.className = 'folder-name';
        folderName.textContent = `📁 ${item.name}`;
        folderDiv.appendChild(folderName);

        const subContainer = buildTree(item.children || []);
        folderDiv.appendChild(subContainer);
        container.appendChild(folderDiv);
      } else if (item.kind === 'file') {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'tree-item';
        fileDiv.textContent = `📄 ${item.name}`;
        fileDiv.addEventListener('click', () => openFile(item, fileDiv));
        container.appendChild(fileDiv);
      }
    }
    return container;
  }

  async function openFile(fileItem, element) {
    try {
      document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
      element.classList.add('active');

      const data = await driveGet({ action: 'read', id: fileItem.id });
      currentFile = { id: fileItem.id, name: fileItem.name };

      const text = data.content || '';
      titleInput.value = fileItem.name.replace(/\.[^/.]+$/, '');

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
    } catch (err) {
      console.error('Fout bij openen van bestand:', err);
      alert('Kon bestand niet openen uit Google Drive: ' + err.message);
    }
  }

  // --- EMOJI MODAL LOGICA ---
  const emojiModal = document.getElementById('emoji-modal');
  const closeEmojiModalBtn = document.getElementById('close-emoji-modal');

  emojiBtn.addEventListener('click', () => {
    if (!currentFile) return;
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

  // --- 2. NIEUWE NOTITIE MAKEN IN DRIVE ---
  btnNewFile.addEventListener('click', async () => {
    if (!isDriveConnected) return;
    const rawName = prompt('Naam voor nieuwe notitie:', 'nieuwe-notitie');
    if (!rawName) return;

    const fileName = rawName.trim().endsWith('.txt') ? rawName.trim() : rawName.trim() + '.txt';

    try {
      await drivePost({
        action: 'create',
        name: fileName,
        content: '<!--EMOJI:📝-->\n'
      });

      const listData = await driveGet({ action: 'list' });
      renderFileTree(listData.items || []);

      const items = fileTree.querySelectorAll('.tree-item');
      for (const item of items) {
        if (item.textContent.includes(fileName)) {
          item.click();
          break;
        }
      }
    } catch (err) {
      alert('Kon bestand niet aanmaken in Google Drive: ' + err.message);
    }
  });

  // --- 3. AUTOMATISCH OPSLAAN NAAR GOOGLE DRIVE ---
  async function saveCurrentFile() {
    if (!currentFile || !isDriveConnected) return;
    try {
      const currentEmoji = emojiBtn.textContent || '📄';
      const fileContent = `<!--EMOJI:${currentEmoji}-->\n` + editor.innerHTML;

      await drivePost({
        action: 'save',
        id: currentFile.id,
        content: fileContent
      });
    } catch (err) {
      console.error('Fout bij opslaan naar Drive:', err);
    }
  }

  editor.addEventListener('input', () => {
    updateWordCount();
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentFile, 600);
  });

  titleInput.addEventListener('input', async () => {
    if (!currentFile) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentFile, 600);
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

  // --- MARKER FUNCTIONALITEIT (ULTRA-ROBUUST VOOR LIJSTEN) ---
  document.getElementById('btn-highlight').addEventListener('click', () => {
    editor.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
      alert('Selecteer eerst een woord of zin in je tekst.');
      return;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    const highlightElement = container.nodeType === 3 ? container.parentElement.closest('.text-highlight') : container.closest('.text-highlight');

    if (highlightElement) {
      const parent = highlightElement.parentNode;
      while (highlightElement.firstChild) {
        parent.insertBefore(highlightElement.firstChild, highlightElement);
      }
      parent.removeChild(highlightElement);
    } else {
      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      const spanHtml = `<span class="text-highlight">${selectedText}</span>`;

      range.deleteContents();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = spanHtml;
      const frag = document.createDocumentFragment();
      let node;
      while ((node = tempDiv.firstChild)) {
        frag.appendChild(node);
      }
      range.insertNode(frag);
    }

    selection.removeAllRanges();
    saveCurrentFile();
  });

  document.getElementById('btn-link').addEventListener('click', () => {
    editor.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === 3 ? container.parentElement : container;
    const callout = element ? element.closest('.notion-callout') : null;

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

  editor.addEventListener('click', (e) => {
    if (e.altKey) return;

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

  // --- 5. VORMGEVING, KLEUREN & CUSTOM SFEREN ---
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

  function updateWordCount() {
    const text = editor.innerText.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCountDisplay.textContent = `${words} ${words === 1 ? 'woord' : 'woorden'}`;
  }
});
