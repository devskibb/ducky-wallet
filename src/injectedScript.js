// injectedScript.js

(function () {
  if (window.ethereum) return;

  // Try to restore connection state
  let savedConnection;
  try {
    savedConnection = JSON.parse(localStorage.getItem('ethereum_connection'));
  } catch (e) {
    console.warn('Failed to restore connection state:', e);
  }

  window.ethereum = {
    isMyEthereumWallet: true,
    isConnected: () => !!window.ethereum.selectedAddress,
    selectedAddress: null,
    chainId: null,
    _connected: false,
    _listeners: {},

    request: async (args) => {
      return new Promise((resolve, reject) => {
        const requestId = Date.now().toString(36);
        console.log('Sending request:', { args, requestId });
        
        const handler = (event) => {
          if (event.source !== window || event.data.type !== 'ETH_RESPONSE') return;
          if (event.data.id === requestId) {
            window.removeEventListener('message', handler);
            
            if (event.data.error) {
              console.error('Request error:', event.data.error);
              reject(new Error(event.data.error));
            } else {
              if (args.method === 'eth_requestAccounts') {
                window.ethereum.selectedAddress = event.data.result[0];
                window.ethereum._connected = true;
                
                // Emit events only once
                setTimeout(() => {
                  window.ethereum._emitEvent('connect', { chainId: window.ethereum.chainId });
                  window.ethereum._emitEvent('accountsChanged', [event.data.result[0]]);
                }, 0);
              }
              resolve(event.data.result);
            }
          }
        };

        window.addEventListener('message', handler);
        
        window.postMessage({
          type: 'ETH_REQUEST',
          id: requestId,
          args: args
        }, window.location.origin);
      });
    },

    on: function(eventName, handler) {
      if (!this._listeners[eventName]) {
        this._listeners[eventName] = [];
      }
      this._listeners[eventName].push(handler);
    },

    removeListener: function(eventName, handler) {
      if (!this._listeners[eventName]) return;
      this._listeners[eventName] = this._listeners[eventName]
        .filter(h => h !== handler);
    },

    _emit: function(eventName, data) {
      if (!this._listeners[eventName]) return;
      this._listeners[eventName].forEach(handler => handler(data));
    },

    disconnect: async () => {
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);
        
        const handler = (event) => {
          if (event.source !== window || event.data.type !== 'ETH_RESPONSE') return;
          if (event.data.id === requestId) {
            window.removeEventListener('message', handler);
            window.ethereum.selectedAddress = null;
            window.ethereum._emit('accountsChanged', []);
            resolve(true);
          }
        };

        window.addEventListener('message', handler);
        
        window.postMessage({
          type: 'ETH_REQUEST',
          args: {
            method: 'eth_disconnect'
          },
          id: requestId
        }, '*');
      });
    },

    _emitEvent: function(eventName, payload) {
      if (!this._listeners[eventName]) return;
      this._listeners[eventName].forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in ${eventName} handler:`, error);
        }
      });
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ETH_CONNECTION_CHECK') {
      window.postMessage({
        type: 'ETH_CONNECTION_STATUS',
        connected: !!window.ethereum.selectedAddress
      }, '*');
    }
  });
})();
