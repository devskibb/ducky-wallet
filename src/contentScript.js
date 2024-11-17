// contentScript.js

// Handle requests from webpage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data.type || !event.data.id) return;
  
  console.log('Content script received message:', event.data);
  
  if (event.data.type === 'ETH_REQUEST') {
    const { method } = event.data.args;
    
    if (method === 'eth_requestAccounts') {
      // Forward to background script
      try {
        chrome.runtime.sendMessage({
          type: 'eth_requestAccounts',
          origin: window.location.origin,
          id: event.data.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            window.postMessage({
              type: 'ETH_RESPONSE',
              id: event.data.id,
              error: 'Extension disconnected'
            }, '*');
            return;
          }
          console.log('Background response:', response);
        });
      } catch (error) {
        console.error('Send message error:', error);
        window.postMessage({
          type: 'ETH_RESPONSE',
          id: event.data.id,
          error: 'Failed to connect to wallet'
        }, '*');
      }
    }
  }
});

// Handle messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'CONNECTION_CHANGED') {
      // Forward connection status changes to the webpage
      window.postMessage({
        type: 'ETH_EVENT',
        eventName: 'accountsChanged',
        params: message.connected ? [message.address] : []
      }, '*');
    }

    if (message.type === 'ETH_RESPONSE') {
      window.postMessage({
        type: 'ETH_RESPONSE',
        id: message.id,
        result: message.result,
        error: message.error
      }, '*');
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true;
});

// Inject our script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injectedScript.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Add this listener to handle disconnect events from the webpage
window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data.type !== 'ETH_REQUEST') return;
  
  if (event.data.args.method === 'eth_disconnect') {
    chrome.runtime.sendMessage({
      type: 'eth_disconnect',
      origin: window.location.origin
    }, (response) => {
      window.postMessage({
        type: 'ETH_RESPONSE',
        id: event.data.id,
        result: true
      }, '*');
    });
  }
});

// Add this listener to handle extension messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONNECTION_CHANGED') {
    // Forward connection status changes to the webpage
    window.postMessage({
      type: 'ETH_ACCOUNTS_CHANGED',
      accounts: message.connected ? [message.address] : []
    }, '*');

    // Update connection status in popup if it's open
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONNECTION_STATUS',
      connected: message.connected,
      origin: window.location.origin
    });
  }
});

// Add this listener for connection checks
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_DAPP_CONNECTION') {
    // Check if the dapp still considers itself connected
    window.postMessage({
      type: 'ETH_CONNECTION_CHECK',
      origin: message.origin
    }, '*');
    
    // Listen for the response from the injected script
    const handler = (event) => {
      if (event.source !== window || event.data.type !== 'ETH_CONNECTION_STATUS') return;
      window.removeEventListener('message', handler);
      sendResponse({ connected: event.data.connected });
    };
    
    window.addEventListener('message', handler);
    return true; // Keep the message channel open for the async response
  }
});
