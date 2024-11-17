// injectedScript.js

(function () {
    if (window.ethereum) return;
  
    window.ethereum = {
      isMyEthereumWallet: true,
      isConnected: () => !!window.ethereum.selectedAddress,
      selectedAddress: null,
      chainId: null,
      _listeners: {},

      request: async (args) => {
        return new Promise((resolve, reject) => {
          const requestId = Date.now().toString(36);
          
          const handler = (event) => {
            if (event.source !== window || event.data.type !== 'ETH_RESPONSE') return;
            if (event.data.id === requestId) {
              window.removeEventListener('message', handler);
              if (event.data.error) {
                reject(new Error(event.data.error));
              } else {
                if (args.method === 'eth_requestAccounts') {
                  window.ethereum.selectedAddress = event.data.result[0];
                  window.ethereum._emitEvent('accountsChanged', event.data.result);
                } else if (args.method === 'eth_disconnect') {
                  window.ethereum.selectedAddress = null;
                  window.ethereum._emit('accountsChanged', []);
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
          }, '*');
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

      _emitEvent(eventName, data) {
        if (this._listeners[eventName]) {
          this._listeners[eventName].forEach(callback => callback(data));
        }
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
  