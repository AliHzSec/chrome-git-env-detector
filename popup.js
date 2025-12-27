// Popup UI Management - Get data from background.js
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadFoundItems();
  setupEventListeners();
});

async function loadSettings() {
  const data = await chrome.storage.local.get(['extensionEnabled', 'gitCheckEnabled', 'envCheckEnabled']);
  
  const mainToggle = document.getElementById('mainToggle');
  const gitToggle = document.getElementById('gitToggle');
  const envToggle = document.getElementById('envToggle');
  
  mainToggle.checked = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
  gitToggle.checked = data.gitCheckEnabled !== undefined ? data.gitCheckEnabled : true;
  envToggle.checked = data.envCheckEnabled !== undefined ? data.envCheckEnabled : true;
  
  updateMainToggleLabel(mainToggle.checked);
}

async function loadFoundItems() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getFoundItems' });
    const foundItems = response.foundItems || [];
    
    updateTotalCount(foundItems.length);
    displayResults(foundItems);
  } catch (error) {
    console.error('Error loading found items:', error);
  }
}

function setupEventListeners() {
  // Main toggle
  document.getElementById('mainToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ extensionEnabled: enabled });
    updateMainToggleLabel(enabled);
  });
  
  // Git toggle
  document.getElementById('gitToggle').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ gitCheckEnabled: e.target.checked });
  });
  
  // Env toggle
  document.getElementById('envToggle').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ envCheckEnabled: e.target.checked });
  });
  
  // Clear all button
  document.getElementById('clearAll').addEventListener('click', async () => {
    if (confirm('Clear all detected exposures?')) {
      await chrome.runtime.sendMessage({ action: 'clearAll' });
      await loadFoundItems();
    }
  });
}

function updateMainToggleLabel(enabled) {
  document.getElementById('mainToggleLabel').textContent = enabled ? 'ON' : 'OFF';
}

function updateTotalCount(count) {
  document.getElementById('totalCount').textContent = count;
}

function displayResults(items) {
  const resultsList = document.getElementById('resultsList');
  
  if (items.length === 0) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 11l3 3L22 4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>No exposures detected yet</p>
      </div>
    `;
    return;
  }
  
  resultsList.innerHTML = items.map(item => createResultItem(item)).join('');
  
  // Add event listeners to action buttons
  document.querySelectorAll('.action-btn[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.url);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  });
  
  document.querySelectorAll('.action-btn[data-action="open"]').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });
  
  document.querySelectorAll('.action-btn[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ 
        action: 'removeItem', 
        itemId: parseInt(btn.dataset.id),
        target: btn.dataset.target
      });
      await loadFoundItems();
    });
  });
}

function createResultItem(item) {
  const date = new Date(item.timestamp);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  const timeStr = `${year}/${month}/${day} - ${hours}:${minutes}:${seconds}`;
  
  return `
    <div class="result-item">
      <div class="result-header">
        <span class="result-type ${item.type}">${item.type === 'git' ? '.git' : '.env'}</span>
        <div class="result-actions">
          <button class="action-btn" data-action="copy" data-url="${item.url}">Copy</button>
          <button class="action-btn" data-action="open" data-url="${item.url}">Open</button>
          <button class="action-btn" data-action="remove" data-id="${item.id}" data-target="${item.target}">×</button>
        </div>
      </div>
      <div class="result-url">${escapeHtml(item.url)}</div>
      <div class="result-time">Found: ${timeStr}</div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for storage changes to update UI in real-time
chrome.storage.onChanged.addListener((changes) => {
  if (changes.foundItems) {
    loadFoundItems();
  }
  if (changes.extensionEnabled) {
    document.getElementById('mainToggle').checked = changes.extensionEnabled.newValue;
    updateMainToggleLabel(changes.extensionEnabled.newValue);
  }
  if (changes.gitCheckEnabled) {
    document.getElementById('gitToggle').checked = changes.gitCheckEnabled.newValue;
  }
  if (changes.envCheckEnabled) {
    document.getElementById('envToggle').checked = changes.envCheckEnabled.newValue;
  }
});