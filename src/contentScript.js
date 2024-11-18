// contentScript.js

// Keep track of processed messages to prevent duplicates
const processedMessages = new Set();

// Keep track of pending requests
const pendingRequests = new Map();

// Single message handler for all ETH-related messages
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data.type) return;
  
  // Create a unique key for this message
  const messageKey = `${event.data.type}-${event.data.id}`;
  if (processedMessages.has(messageKey)) return;
  processedMessages.add(messageKey);
  
  // Clean up old messages (optional)
  setTimeout(() => processedMessages.delete(messageKey), 5000);
  
  console.log('Content script received message:', event.data);
  
  if (event.data.type === 'ETH_REQUEST') {
    const { method } = event.data.args;
    
    if (method === 'eth_requestAccounts') {
      // Store the request ID
      pendingRequests.set(event.data.id, true);
      
      chrome.runtime.sendMessage({
        type: 'eth_requestAccounts',
        origin: window.location.origin,
        id: event.data.id
      });
    }
  }
});

// Listen for responses from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background message received:', message);
  
  if (message.type === 'ETH_RESPONSE') {
    // Forward the response to the webpage
    window.postMessage({
      type: 'ETH_RESPONSE',
      id: message.id,
      result: message.result,
      error: message.error
    }, window.location.origin);
    
    // Clean up pending request
    pendingRequests.delete(message.id);
    
    sendResponse({ success: true });
  }
  
  if (message.type === 'CONNECTION_CHANGED' && message.connected) {
    // Emit connection events only once
    window.postMessage({
      type: 'ETH_EVENT',
      eventName: 'accountsChanged',
      params: [message.address]
    }, window.location.origin);
    
    sendResponse({ success: true });
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

// Add connection status check
let lastKnownAddress = null;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data.type) return;
  
  console.log('Content script received message:', event.data);
  
  // Only process messages that don't already have connectionStatus
  if (event.data.type === 'ETH_RESPONSE' && event.data.result && !event.data.connectionStatus) {
    // Check if this is a new connection
    if (Array.isArray(event.data.result) && event.data.result[0] !== lastKnownAddress) {
      lastKnownAddress = event.data.result[0];
      // Notify background script of new connection
      chrome.runtime.sendMessage({
        type: 'CONNECTION_CHANGED',
        connected: true,
        address: lastKnownAddress
      });
    }
    
    // Forward the response with connectionStatus
    window.postMessage({
      ...event.data,
      connectionStatus: {
        connected: true,
        address: lastKnownAddress
      }
    }, window.location.origin);
  }
});