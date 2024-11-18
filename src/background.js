// background.js

let walletSession = null;
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
let lockTimer = null;
let activeConnections = new Map();

function resetLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(lockWallet, LOCK_TIMEOUT);
}

function lockWallet() {
  walletSession = null;
  clearTimeout(lockTimer);
  chrome.runtime.sendMessage({ action: 'walletLocked' });
}

// Security headers
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const securityHeaders = {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };

    const responseHeaders = details.responseHeaders || [];
    Object.entries(securityHeaders).forEach(([header, value]) => {
      responseHeaders.push({ name: header, value: value });
    });
    return { responseHeaders };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Reset lock timer on any activity
  resetLockTimer();

  if (request.action === 'setWalletSession') {
    walletSession = request.data;
    sendResponse({ success: true });
  }
  else if (request.action === 'getWalletSession') {
    sendResponse(walletSession);
    return true;
  }
  else if (request.action === 'resetTimer') {
    resetLockTimer();
    sendResponse({ success: true });
  }
  else if (request.action === 'lockWallet') {
    lockWallet();
    sendResponse({ success: true });
  }
  else if (request.type === 'eth_requestAccounts') {
    console.log('Received eth_requestAccounts request:', request);
    // Store pending connection
    chrome.storage.local.set({
      pendingConnection: {
        origin: sender.origin || request.origin,
        tabId: sender.tab.id,
        requestId: request.id
      },
      pendingOrigin: sender.origin || request.origin
    }).then(() => {
      // Open popup for approval
      chrome.windows.create({
        url: 'popup.html#connection-request',
        type: 'popup',
        width: 360,
        height: 600
      });
    });
    
    return true;
  }
  else if (request.type === 'eth_disconnect') {
    console.log('Processing disconnect for:', request.origin);
    // Remove from active connections
    activeConnections.delete(request.origin);
    
    // Notify all extension views
    chrome.runtime.sendMessage({
      type: 'CONNECTION_CHANGED',
      connected: false,
      origin: request.origin
    });
    
    // Notify the specific tab
    if (sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'CONNECTION_CHANGED',
        connected: false,
        origin: request.origin
      });
    }
    
    // Update popup if open
    chrome.runtime.sendMessage({
      action: 'updateConnectionStatus',
      connected: false,
      origin: request.origin
    });
    
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'checkConnection') {
    const connection = activeConnections.get(request.origin);
    
    // Also check if the dapp is still connected by sending a ping
    if (connection) {
      try {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CHECK_DAPP_CONNECTION',
          origin: request.origin
        }, (response) => {
          if (!response || !response.connected) {
            activeConnections.delete(request.origin);
            sendResponse({ connected: false });
          } else {
            sendResponse({
              connected: true,
              address: connection.address
            });
          }
        });
        return true; // Keep the message channel open for the async response
      } catch (error) {
        console.error('Error checking dapp connection:', error);
        activeConnections.delete(request.origin);
        sendResponse({ connected: false });
      }
    } else {
      sendResponse({ connected: false });
    }
    return true;
  }
  else if (request.type === 'CONNECTION_APPROVED') {
    chrome.storage.local.get(['pendingConnection'], (data) => {
      if (data.pendingConnection) {
        // Send response to content script
        chrome.tabs.sendMessage(data.pendingConnection.tabId, {
          type: 'ETH_RESPONSE',
          id: data.pendingConnection.requestId,
          result: [request.address]
        });
        
        // Also send connection status
        chrome.tabs.sendMessage(data.pendingConnection.tabId, {
          type: 'CONNECTION_CHANGED',
          connected: true,
          address: request.address
        });
        
        // Clear pending connection
        chrome.storage.local.remove('pendingConnection');
      }
    });
    
    sendResponse({ success: true });
    return true;
  }
  return true;
});

// Clear connections when extension is closed
chrome.runtime.onSuspend.addListener(() => {
  activeConnections.clear();
  lockWallet();
});

// Add tab update listener
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.sendMessage(activeInfo.tabId, {
    type: 'CHECK_CONNECTION'
  });
});
  