// IMPORTANT: This extension should ONLY be used for authorized security testing
// on targets where you have explicit written permission (bug bounty programs, pentests, etc.)

// Replace in-memory Set with persistent storage to survive service worker restarts
let checkedTargets = new Set();
let extensionEnabled = true;
let gitCheckEnabled = true;
let envCheckEnabled = true;
let foundItems = [];

// Lock to prevent race conditions during concurrent checks
const checkLocks = new Map();

// Initialize extension state
async function initializeExtension() {
  const data = await chrome.storage.local.get([
    'extensionEnabled',
    'gitCheckEnabled',
    'envCheckEnabled',
    'foundItems',
    'checkedTargets'
  ]);

  extensionEnabled = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
  gitCheckEnabled = data.gitCheckEnabled !== undefined ? data.gitCheckEnabled : true;
  envCheckEnabled = data.envCheckEnabled !== undefined ? data.envCheckEnabled : true;
  foundItems = data.foundItems || [];

  // Load persisted checked targets from storage
  checkedTargets = new Set(data.checkedTargets || []);

  updateBadge();
}

// Call on install and startup
chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

// Also initialize on service worker startup
chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

// Initialize immediately when service worker starts
initializeExtension();

// Persist checkedTargets to storage whenever it changes
async function persistCheckedTargets() {
  await chrome.storage.local.set({
    checkedTargets: Array.from(checkedTargets)
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionEnabled) {
    extensionEnabled = changes.extensionEnabled.newValue;
    updateBadge();
  }
  if (changes.gitCheckEnabled) {
    gitCheckEnabled = changes.gitCheckEnabled.newValue;
  }
  if (changes.envCheckEnabled) {
    envCheckEnabled = changes.envCheckEnabled.newValue;
  }
  if (changes.foundItems) {
    foundItems = changes.foundItems.newValue;
  }
  // Sync checkedTargets if changed externally (e.g., from popup)
  if (changes.checkedTargets) {
    checkedTargets = new Set(changes.checkedTargets.newValue || []);
  }
});

// FIXED: Use ONLY onUpdated to avoid redundant event listeners
// Removed onBeforeNavigate and onCommitted to eliminate duplicate triggers
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!extensionEnabled) return;

  // FIXED: Use if-else to prevent double-triggering
  // Only check on URL change OR on complete, not both
  if (changeInfo.url) {
    // URL changed - check immediately
    try {
      const url = new URL(changeInfo.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
      }
    } catch (e) {}
  } else if (changeInfo.status === 'complete' && tab.url) {
    // Page finished loading - check in case URL change wasn't caught
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        checkTarget(url);
      }
    } catch (e) {}
  }
});

function getTargetKey(scheme, hostname) {
  return `${scheme}://${hostname}`;
}

function isAlreadyFound(targetKey) {
  return foundItems.some(item => item.target === targetKey);
}

// FIXED: Added proper async lock mechanism to prevent race conditions
async function checkTarget(url) {
  const scheme = url.protocol.replace(':', '');
  const hostname = url.hostname;
  const targetKey = getTargetKey(scheme, hostname);

  // Check if already checked or found
  if (checkedTargets.has(targetKey) || isAlreadyFound(targetKey)) {
    return;
  }

  // FIXED: Check for existing lock to prevent race condition
  if (checkLocks.has(targetKey)) {
    return; // Another check is already in progress for this target
  }

  // Set lock before adding to checkedTargets
  checkLocks.set(targetKey, true);

  // Add to checked targets immediately (synchronous)
  checkedTargets.add(targetKey);

  // Persist to storage to survive service worker restarts
  await persistCheckedTargets();

  const baseUrl = `${scheme}://${hostname}`;

  try {
    if (gitCheckEnabled) {
      await checkGitConfig(baseUrl, targetKey);
    }

    if (envCheckEnabled) {
      await checkEnvFile(baseUrl, targetKey);
    }
  } finally {
    // Release lock after checks complete
    checkLocks.delete(targetKey);
  }
}

async function checkGitConfig(baseUrl, targetKey) {
  const gitUrl = `${baseUrl}/.git/config`;

  console.log('[GIT]', gitUrl);

  try {
    const response = await fetch(gitUrl, {
      method: 'GET',
      headers: {
        'Origin': baseUrl,
        'X-Forwarded-For': '127.0.0.1',
        'Cookie': 'PHPSESSID=TEST',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      credentials: 'omit'
    });

    if (response.status === 200) {
      const text = await response.text();
      const lowerText = text.toLowerCase();

      const gitPatterns = [
        /\[gc/,
        /\[core/,
        /\[user/,
        /\[http/,
        /\[remote/,
        /\[branch/,
        /\[credentials/
      ];

      const hasGitPattern = gitPatterns.some(pattern => pattern.test(text));
      const hasHtml = lowerText.includes('<html') || lowerText.includes('<body');

      if (hasGitPattern && !hasHtml) {
        addFoundItem(targetKey, 'git', gitUrl, null);
      }
    }
  } catch (e) {
    // Silently handle network errors
  }
}

async function checkEnvFile(baseUrl, targetKey) {
  const envUrl = `${baseUrl}/.env`;

  console.log('[ENV]', envUrl);

  try {
    const response = await fetch(envUrl, {
      method: 'GET',
      headers: {
        'Origin': baseUrl,
        'X-Forwarded-For': '127.0.0.1',
        'Cookie': 'PHPSESSID=TEST',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      credentials: 'omit'
    });

    if (response.status === 200) {
      const text = await response.text();
      const envPattern = /^[a-zA-Z_][a-zA-Z0-9_]*\s*=|^[#\n\r ][\s\S]*^[a-zA-Z_][a-zA-Z0-9_]*\s*=/m;

      if (envPattern.test(text)) {
        addFoundItem(targetKey, 'env', envUrl, null);
      }
    }
  } catch (e) {
    // Silently handle network errors
  }
}

function addFoundItem(target, type, url, secrets) {
  const item = {
    id: Date.now(),
    target: target,
    type: type,
    url: url,
    secrets: secrets,
    timestamp: new Date().toISOString()
  };

  foundItems.push(item);
  chrome.storage.local.set({ foundItems });

  showNotification(type, target, url);
  updateBadge();
}

function showNotification(type, target, url) {
  const typeLabel = type === 'git' ? '.git/config' : '.env';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${typeLabel} Exposed!`,
    message: `Found on: ${url}`,
    priority: 2
  });
}

function updateBadge() {
  if (!extensionEnabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
  } else {
    const count = foundItems.length;
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFoundItems') {
    sendResponse({ foundItems });
  } else if (request.action === 'removeItem') {
    foundItems = foundItems.filter(item => item.id !== request.itemId);
    chrome.storage.local.set({ foundItems });

    // Remove from checked targets so it can be re-checked
    checkedTargets.delete(request.target);
    persistCheckedTargets();

    updateBadge();
    sendResponse({ success: true });
  } else if (request.action === 'clearAll') {
    foundItems = [];
    chrome.storage.local.set({ foundItems });

    // Clear all checked targets
    checkedTargets.clear();
    persistCheckedTargets();

    updateBadge();
    sendResponse({ success: true });
  }
  return true;
});
