import { ethers } from 'ethers';
import { getCurrentNetwork, initializeNetworkSelector } from './network.js';
import { setupSettingsListeners } from './settings.js';
import { loadTokens, displayTransactionHistory } from './tokens.js';
import { copyToClipboard, showCopyNotification } from './utils.js';
import { formatDistanceToNow } from 'date-fns';
import { showTransactionConfirmation, showTransactionSuccess } from './transactions.js';

// Private module state
let _wallet = null;
let _provider = null;
let _currentAccountIndex = 0;
let _accounts = [];

// Getters and setters for wallet state
export const getWallet = () => _wallet;
export const getProvider = () => _provider;
export const setWallet = (newWallet) => { _wallet = newWallet; };
export const setProvider = (newProvider) => { _provider = newProvider; };
export const getCurrentAccountIndex = () => _currentAccountIndex;
export const getAccounts = () => _accounts;
export const setCurrentAccountIndex = (index) => {
  _currentAccountIndex = index;
  _wallet = _accounts[index];
};

// Add utility function to encrypt/decrypt mnemonic
async function encryptMnemonic(mnemonic, password) {
  try {
    // Convert password to bytes
    const passwordBytes = new TextEncoder().encode(password);
    
    // Create a unique salt for this encryption
    const salt = ethers.randomBytes(16);
    // Generate random IV
    const iv = ethers.randomBytes(16);
    
    // Create encryption key using native Web Crypto API
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 1000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Encrypt the mnemonic
    const encodedMnemonic = new TextEncoder().encode(mnemonic);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedMnemonic
    );
    
    // Combine salt, IV, and encrypted data
    return {
      salt: Buffer.from(salt).toString('hex'),
      iv: Buffer.from(iv).toString('hex'),
      data: Buffer.from(encryptedData).toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt mnemonic');
  }
}

async function decryptMnemonic(encryptedData, password) {
  try {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const data = Buffer.from(encryptedData.data, 'hex');
    
    // Convert password to bytes
    const passwordBytes = new TextEncoder().encode(password);
    
    // Create decryption key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 1000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt mnemonic');
  }
}

// Add these helper functions
async function saveAccounts() {
  const accountsData = _accounts.map(account => ({
    address: account.address,
    index: _accounts.indexOf(account)
  }));
  
  await chrome.storage.local.set({
    accounts: accountsData,
    currentAccountIndex: _currentAccountIndex
  });
}

async function loadAccounts(mnemonic) {
  const data = await chrome.storage.local.get(['accounts', 'currentAccountIndex']);
  if (data.accounts && data.accounts.length > 0) {
    // Recreate accounts from stored data
    _accounts = data.accounts.map(acc => {
      const hdNode = ethers.HDNodeWallet.fromPhrase(
        mnemonic,
        undefined,
        `m/44'/60'/0'/0/${acc.index}`
      );
      return hdNode.connect(_provider);
    });
    _currentAccountIndex = data.currentAccountIndex || 0;
    _wallet = _accounts[_currentAccountIndex];
  } else {
    // Initialize with first account if no stored accounts
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      "m/44'/60'/0'/0/0"
    );
    _wallet = hdNode.connect(_provider);
    _accounts = [_wallet];
    _currentAccountIndex = 0;
    await saveAccounts();
  }
  
  // Add this line to update the account selector
  updateAccountSelector();
}

// Modify unlockWallet to use these functions
export async function unlockWallet() {
  try {
    const password = document.getElementById('unlock-wallet-password').value;
    if (!password) {
      throw new Error('Please enter your password.');
    }

    const data = await chrome.storage.local.get(['encryptedMnemonic']);
    const mnemonic = await decryptMnemonic(data.encryptedMnemonic, password);
    
    // Get current network and create provider
    const currentNetwork = await getCurrentNetwork();
    _provider = new ethers.JsonRpcProvider(currentNetwork.rpcUrl);
    
    // Load or initialize accounts
    await loadAccounts(mnemonic);
    
    // Update the address display at the top
    const addressDisplay = document.getElementById('display-address');
    if (addressDisplay) {
      addressDisplay.textContent = _wallet.address;
    }
    
    // Store wallet session
    chrome.runtime.sendMessage({
      action: 'setWalletSession',
      data: {
        wallet: {
          privateKey: _wallet.privateKey,
          address: _wallet.address
        },
        provider: currentNetwork.rpcUrl
      }
    });

    // Update UI
    const walletSection = document.getElementById('wallet-section');
    if (walletSection) {
      walletSection.innerHTML = '';
      walletSection.classList.add('hidden');
    }
    const modelContainer = document.getElementById('model-container');
    if (modelContainer) modelContainer.style.display = 'none';

    const mainContent = document.getElementById('main-content');
    const accountsSection = document.getElementById('accounts-section');
    if (mainContent) mainContent.classList.remove('hidden');
    if (accountsSection) accountsSection.classList.remove('hidden');

    await displayAccountInfo();
    updateNetworkDisplay();

  } catch (error) {
    console.error('Unlock error:', error);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = error.message;
    document.getElementById('unlock-wallet-password').after(errorDiv);
  }
}

export function checkWallet() {
  return new Promise((resolve) => {
    // Check chrome.runtime for an unlocked wallet session
    chrome.runtime.sendMessage({ action: 'getWalletSession' }, (response) => {
      if (response && response.wallet) {
        // Reconstruct the wallet from the session data
        const provider = new ethers.JsonRpcProvider(response.provider);
        _wallet = new ethers.Wallet(response.wallet.privateKey, provider);
        _provider = provider;
        
        // Hide wallet setup
        const walletSection = document.getElementById('wallet-section');
        if (walletSection) {
          walletSection.innerHTML = '';
          walletSection.classList.add('hidden');
        }

        // Hide the duck
        const modelContainer = document.getElementById('model-container');
        if (modelContainer) {
          modelContainer.style.display = 'none';
        }

        displayAccountInfo();
        resolve(true);
        return;
      }

      // If no active session, check storage
      chrome.storage.local.get(['encryptedMnemonic'], (data) => {
        if (data.encryptedMnemonic) {
          displayUnlockWallet();
        } else {
          displayWalletSetup();
        }
        resolve(!!data.encryptedMnemonic);
      });
    });
  });
}

export function displayWalletSetup() {
    const walletSection = document.getElementById('wallet-section');
    if (walletSection) {
      walletSection.innerHTML = `
        <button id="create-wallet-button">Create New Wallet</button>
        <button id="import-wallet-button" class="secondary-button">Import Wallet</button>
      `;
      walletSection.querySelector('#create-wallet-button').addEventListener('click', showCreateWalletForm);
      walletSection.querySelector('#import-wallet-button').addEventListener('click', showImportWalletForm);
    } else {
      console.error('wallet-section element not found.');
    }
  
    // Hide other sections
    const sectionsToHide = ['accounts-section', 'send-section', 'tokens-section', 'settings-section', 'add-network-section', 'export-section'];
    sectionsToHide.forEach(id => {
      const section = document.getElementById(id);
      if (section) {
        section.classList.add('hidden');
      }
    });
  
    // Hide settings icon
    const settingsIconContainer = document.getElementById('settings-icon-container');
    if (settingsIconContainer) {
      settingsIconContainer.classList.add('hidden');
    }
  
    // Show main-content
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.classList.remove('hidden');
    }
  }
  
  export function showCreateWalletForm() {
    const walletSection = document.getElementById('wallet-section');
    if (walletSection) {
      walletSection.innerHTML = `
        <label for="new-wallet-password">Set a password for your wallet:</label>
        <input type="password" id="new-wallet-password" placeholder="Password">
        <button id="create-wallet-submit">Create Wallet</button>
      `;
      walletSection.querySelector('#create-wallet-submit').addEventListener('click', createNewWallet);
    } else {
      console.error('wallet-section element not found.');
    }
  }
  
  async function showMnemonicSecurely(mnemonic) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'secure-mnemonic-modal';
      modal.innerHTML = `
        <div class="secure-content">
          <h3>Write Down Your Recovery Phrase</h3>
          <p class="warning">
            <svg class="warning-icon" viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            This is the ONLY time you'll see this phrase. If you lose it, you'll lose access to your wallet forever.
          </p>
          <div class="mnemonic-words">
            ${mnemonic.split(' ').map((word, i) => 
              `<div class="word"><span class="number">${i + 1}.</span> ${word}</div>`
            ).join('')}
          </div>
          <div class="confirmation-box">
            <label>
              <input type="checkbox" id="written-confirmation" required>
              I have written down my recovery phrase
            </label>
            <label>
              <input type="checkbox" id="understand-confirmation" required>
              I understand that I cannot recover my wallet without this phrase
            </label>
          </div>
          <button id="confirm-backup" disabled>I've Saved My Recovery Phrase</button>
        </div>
      `;

      document.body.appendChild(modal);

      // Add event listeners for checkboxes
      const writtenConfirmation = document.getElementById('written-confirmation');
      const understandConfirmation = document.getElementById('understand-confirmation');
      const confirmButton = document.getElementById('confirm-backup');

      function updateConfirmButton() {
        confirmButton.disabled = !(writtenConfirmation.checked && understandConfirmation.checked);
      }

      writtenConfirmation.addEventListener('change', updateConfirmButton);
      understandConfirmation.addEventListener('change', updateConfirmButton);

      // Add event listener for confirm button
      confirmButton.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true); // Resolve the promise when user confirms
      });
    });
  }

  export async function createNewWallet() {
    try {
      const password = document.getElementById('new-wallet-password').value;
      if (!password) {
        throw new Error('Password is required');
      }

      // Create new wallet
      const hdNode = ethers.HDNodeWallet.createRandom();
      const mnemonic = hdNode.mnemonic.phrase;

      // Show mnemonic for backup
      await showMnemonicSecurely(mnemonic);

      // Encrypt mnemonic
      const encryptedMnemonic = await encryptMnemonic(mnemonic, password);

      // Save to chrome storage
      await chrome.storage.local.set({
        encryptedMnemonic: encryptedMnemonic,
        accountCount: 1
      });

      // Setup initial wallet state
      const currentNetwork = await getCurrentNetwork();
      _provider = new ethers.JsonRpcProvider(currentNetwork.rpcUrl);
      _wallet = hdNode.connect(_provider);
      _accounts = [_wallet];
      _currentAccountIndex = 0;

      // Hide wallet setup section
      const walletSection = document.getElementById('wallet-section');
      if (walletSection) {
        walletSection.innerHTML = ''; // Clear the content
        walletSection.classList.add('hidden');
      }

      // Hide the duck
      const modelContainer = document.getElementById('model-container');
      if (modelContainer) {
        modelContainer.style.display = 'none';
      }

      // Show main content
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.classList.remove('hidden');
      }

      // Store session
      chrome.runtime.sendMessage({
        action: 'setWalletSession',
        data: {
          wallet: {
            privateKey: _wallet.privateKey,
            address: _wallet.address
          },
          provider: currentNetwork.rpcUrl
        }
      });

      // Update UI
      displayAccountInfo();
      updateNetworkDisplay();

      return _wallet.address;
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw new Error('Failed to create wallet');
    }
  }
  
  export function showImportWalletForm() {
    const walletSection = document.getElementById('wallet-section');
    if (walletSection) {
      walletSection.innerHTML = `
        <label for="import-mnemonic">Enter your mnemonic phrase:</label>
        <input type="text" id="import-mnemonic" placeholder="Mnemonic Phrase">
        <label for="import-wallet-password">Set a password for your wallet:</label>
        <input type="password" id="import-wallet-password" placeholder="Password">
        <button id="import-wallet-submit">Import Wallet</button>
      `;
      walletSection.querySelector('#import-wallet-submit').addEventListener('click', importWallet);
    } else {
      console.error('wallet-section element not found.');
    }
  }
  
  export async function importWallet() {
    const mnemonic = document.getElementById('import-mnemonic').value.trim();
    const password = document.getElementById('import-wallet-password').value;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();

    if (!mnemonic || !password) {
      errorDiv.textContent = 'Please enter your mnemonic and a password.';
      document.getElementById('import-wallet-submit').before(errorDiv);
      return;
    }
  
    try {
      const wallet = ethers.Wallet.fromPhrase(mnemonic);
      const encryptedJson = await wallet.encrypt(password);

      // Store only encrypted wallet
      await chrome.storage.local.set({ wallet: encryptedJson });

      // Clear sensitive data
      wallet.mnemonic = null;
      displayUnlockWallet();
    } catch (error) {
      console.error('Import error');
      errorDiv.textContent = 'Invalid mnemonic phrase.';
      document.getElementById('import-mnemonic').after(errorDiv);
    }
  }
  
  export function displayUnlockWallet() {
    const walletSection = document.getElementById('wallet-section');
    const modelContainer = document.getElementById('model-container');
    
    // Show the duck model
    if (modelContainer) {
      modelContainer.style.display = 'block';
    }

    if (walletSection) {
      walletSection.innerHTML = `
        <label for="unlock-wallet-password">Enter your wallet password:</label>
        <input type="password" id="unlock-wallet-password" placeholder="Password">
        <button id="unlock-wallet-button">Unlock Wallet</button>
      `;
  
      const unlockButton = walletSection.querySelector('#unlock-wallet-button');
      if (unlockButton) {
        unlockButton.addEventListener('click', () => unlockWallet());
      }
  
      const passwordInput = walletSection.querySelector('#unlock-wallet-password');
      if (passwordInput) {
        passwordInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            unlockWallet();
          }
        });
      }
    } else {
      console.error('wallet-section element not found.');
    }
  
    const sectionsToHide = ['accounts-section', 'send-section', 'tokens-section', 'settings-section', 'add-network-section', 'export-section'];
    sectionsToHide.forEach(id => {
      const section = document.getElementById(id);
      if (section) {
        section.classList.add('hidden');
      }
    });
  
    const settingsIconContainer = document.getElementById('settings-icon-container');
    if (settingsIconContainer) {
      settingsIconContainer.classList.add('hidden');
    }
  
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.classList.remove('hidden');
    }
  }

  export function updateNetworkDisplay() {
    console.log('Updating network display');
    const header = document.querySelector('header');
    
    // Setup network display
    let networkDisplay = document.querySelector('.network-display');
    if (!networkDisplay) {
      console.log('Creating new network display element');
      networkDisplay = document.createElement('div');
      networkDisplay.className = 'network-display';
      header.prepend(networkDisplay);
    }
    
    // Setup address display
    let addressDisplay = document.querySelector('.address-display');
    if (!addressDisplay) {
      console.log('Creating new address display element');
      addressDisplay = document.createElement('div');
      addressDisplay.className = 'address-display';
      header.appendChild(addressDisplay);
    }
    
    getCurrentNetwork().then(network => {
      console.log('Setting network display to:', network.name);
      networkDisplay.textContent = network.name;
      networkDisplay.setAttribute('data-status', 'connected');
      
      // Update address display
      const wallet = getWallet();
      if (wallet) {
        addressDisplay.textContent = wallet.address;
        addressDisplay.addEventListener('click', () => copyToClipboard(wallet.address));
      }
    }).catch(error => {
      console.error('Error updating network display:', error);
    });
  }

  export async function displayAccountInfo() {
    const accountsSection = document.getElementById('accounts-section');
    if (!accountsSection || !_wallet) return;

    try {
      const provider = getProvider();
      const balance = await provider.getBalance(_wallet.address);
      const network = await getCurrentNetwork();

      // First, ensure accounts section is visible
      accountsSection.classList.remove('hidden');

      // Important: Check if we have accounts before rendering
      if (_accounts.length === 0) {
        _accounts = [_wallet]; // Initialize with current wallet if empty
        _currentAccountIndex = 0;
      }

      accountsSection.innerHTML = `
        <div class="account-selector">
          <select id="account-select">
            ${_accounts.map((acc, i) => `
              <option value="${i}" ${i === _currentAccountIndex ? 'selected' : ''}>
                Account ${i + 1}
              </option>
            `).join('')}
            <option value="new">+ Create New Account</option>
          </select>
        </div>
        <div class="tabs">
          <button class="tab-button active" data-tab="balance">
            Wallet
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
          </button>
          <button class="tab-button" data-tab="history">
            History
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
            <div class="duck-silhouette" style="left: ${Math.random() * 80 + 10}%"></div>
          </button>
        </div>
        <div id="balance-tab" class="tab-content active">
          <div id="balance">Balance: ${ethers.formatEther(balance)} ${network.symbol}</div>
          <button id="send-button" class="primary-button">Send ${network.symbol}</button>
        </div>
        <div id="history-tab" class="tab-content">
          <div class="transaction-list"></div>
        </div>
      `;

      // Add event listeners
      document.getElementById('account-select').addEventListener('change', async (e) => {
        const value = e.target.value;
        if (value === 'new') {
          e.target.value = _currentAccountIndex;
          await createNewAccount();
        } else {
          switchAccount(Number(value));
        }
      });

      // Fix tab switching
      const tabs = accountsSection.querySelectorAll('.tab-button');
      const tabContents = accountsSection.querySelectorAll('.tab-content');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active class from all tabs and contents
          tabs.forEach(t => t.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));
          
          // Add active class to clicked tab and corresponding content
          tab.classList.add('active');
          const contentId = `${tab.dataset.tab}-tab`;
          const contentElement = document.getElementById(contentId);
          if (contentElement) {
            contentElement.classList.add('active');
          }

          // Handle tokens section visibility
          const tokensSection = document.getElementById('tokens-section');
          if (tokensSection) {
            if (tab.dataset.tab === 'history') {
              tokensSection.classList.add('hidden');
            } else {
              tokensSection.classList.remove('hidden');
            }
          }

          // Load transaction history if history tab is clicked
          if (tab.dataset.tab === 'history') {
            displayTransactionHistory();
          }
        });
      });

      document.getElementById('send-button').addEventListener('click', showSendForm);

      // Show tokens section
      const tokensSection = document.getElementById('tokens-section');
      if (tokensSection) {
        tokensSection.classList.remove('hidden');
        loadTokens();
      }

      // Initial load of transaction history
      displayTransactionHistory();

    } catch (error) {
      console.error('Error displaying account info:', error);
    }
  }


  function getExplorerUrl(txHash) {
    const network = getCurrentNetwork();
    if (!network || !network.explorerUrl) {
      return `https://etherscan.io/tx/${txHash}`; // Default to Ethereum mainnet
    }
    
    return `${network.explorerUrl}/tx/${txHash}`;
  }

  export function showSendForm() {
    const sendSection = document.getElementById('send-section');
    const balanceTab = document.getElementById('balance-tab');
    const sendButton = document.getElementById('send-button');
    if (!sendSection || !balanceTab) return;

    getCurrentNetwork().then(network => {
      if (sendSection.classList.contains('hidden')) {
        if (sendButton) sendButton.style.display = 'none';

        sendSection.innerHTML = `
          <div class="token-send-form">
            <button id="back-to-balance" class="back-button">
              <svg class="back-icon" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
              Back
            </button>
            <h3>Send ${network.symbol}</h3>
            <div class="send-form-content">
              <label for="to-address">To Address:</label>
              <input type="text" id="to-address" placeholder="0x...">
              
              <label for="amount">Amount (${network.symbol}):</label>
              <input type="number" id="amount" placeholder="Amount" step="0.0001">
              
              <div id="send-error" class="error-message hidden"></div>
              <div id="send-success" class="success-message hidden"></div>
              
              <button id="send-transaction-button">Send ${network.symbol}</button>
            </div>
          </div>
        `;

        // Add event listeners
        document.getElementById('back-to-balance').addEventListener('click', () => {
          sendSection.classList.add('hidden');
          sendSection.innerHTML = '';
          // Show the initial send button again
          if (sendButton) sendButton.style.display = 'block';
        });

        document.getElementById('send-transaction-button').addEventListener('click', handleSendTransaction);
        sendSection.classList.remove('hidden');
      }
    });
  }

  export async function sendTransaction() {
    const toAddress = document.getElementById('send-to-address').value.trim();
    const amount = document.getElementById('send-amount').value;
    const sendButton = document.getElementById('send-transaction-button');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();

    if (!toAddress || !amount) {
      errorDiv.textContent = !toAddress ? 'Please enter recipient address.' : 'Please enter amount.';
      const errorField = !toAddress ? 'send-to-address' : 'send-amount';
      document.getElementById(errorField).after(errorDiv);
      return;
    }

    try {
      // Validate the recipient address
      ethers.getAddress(toAddress); // Throws if invalid

      // Show loading state
      sendButton.disabled = true;
      sendButton.innerHTML = `
        <span class="spinner"></span>
        Sending Transaction...
      `;

      const wallet = getWallet();
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });

      // Show pending state
      sendButton.innerHTML = `
        <span class="spinner"></span>
        Transaction Pending...
      `;

      // Wait for transaction to be mined
      await tx.wait();
      
      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'success-message';
      successDiv.textContent = `Transaction confirmed! Hash: ${tx.hash}`;
      sendButton.after(successDiv);
      
      // Reset button
      sendButton.disabled = false;
      sendButton.textContent = 'Send Transaction';
      
      // Clear the form after a short delay
      setTimeout(() => {
        const sendSection = document.getElementById('send-section');
        if (sendSection) {
          sendSection.classList.add('hidden');
          sendSection.innerHTML = '';
        }
        displayAccountInfo(); // Refresh account info and transaction history
      }, 3000);
      
    } catch (error) {
      console.error('Transaction error:', error);
      sendButton.disabled = false;
      sendButton.textContent = 'Send Transaction';
      errorDiv.textContent = error.message;
      sendButton.before(errorDiv);
    }
  }

  // Add listener for wallet lock events
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'walletLocked') {
      displayUnlockWallet();
    }
  });

  // Reset timer whenever user interacts with wallet
  function resetWalletTimer() {
    chrome.runtime.sendMessage({ action: 'resetTimer' });
  }

  // Update the sendTransaction function
  async function handleSendTransaction(event) {
    event.preventDefault();
    
    const toAddress = document.getElementById('to-address').value;
    const amount = document.getElementById('amount').value;
    const sendButton = document.getElementById('send-transaction-button');
    const errorElement = document.getElementById('send-error');
    const successElement = document.getElementById('send-success');
    const network = await getCurrentNetwork();
    
    try {
      // Basic validation
      if (!toAddress || !amount) {
        throw new Error('Please fill in all fields');
      }

      // Update button state
      sendButton.textContent = 'Pending...';
      sendButton.disabled = true;
      errorElement.classList.add('hidden');
      successElement.classList.add('hidden');

      const provider = getProvider();
      const wallet = getWallet();
      
      if (!ethers.isAddress(toAddress)) {
        throw new Error('Invalid address');
      }

      // Convert amount to Wei
      const valueWei = ethers.parseEther(amount);
      
      // Estimate gas limit for ETH transfer
      const gasLimit = await provider.estimateGas({
        to: toAddress,
        value: valueWei,
        from: wallet.address
      });

      // Show confirmation modal
      const txDetails = {
        to: toAddress,
        value: valueWei,
        gasLimit: gasLimit,
        symbol: network.symbol
      };

      try {
        const { gasPrice } = await showTransactionConfirmation(txDetails);
        
        // Send transaction with selected gas price
        const tx = await wallet.sendTransaction({
          to: toAddress,
          value: valueWei,
          gasLimit: gasLimit,
          gasPrice: gasPrice
        });

        // Wait for confirmation
        await tx.wait();
        
        // Show success message
        successElement.innerHTML = await showTransactionSuccess(tx.hash);
        successElement.classList.remove('hidden');
        
        // Reset form
        document.getElementById('to-address').value = '';
        document.getElementById('amount').value = '';
        
        // Reset button
        sendButton.textContent = `Send ${network.symbol}`;
        sendButton.disabled = false;
        
      } catch (error) {
        // Reset button
        sendButton.textContent = `Send ${network.symbol}`;
        sendButton.disabled = false;
        
        if (error.message === 'Transaction cancelled') {
          return;
        }
        
        throw error;
      }
      
    } catch (error) {
      // Reset button
      sendButton.textContent = `Send ${network.symbol}`;
      sendButton.disabled = false;
      
      // Show error
      errorElement.textContent = error.message;
      errorElement.classList.remove('hidden');
    }
  }

  function setupSendForm() {
    const sendForm = document.getElementById('send-form');
    if (!sendForm) return;

    sendForm.addEventListener('submit', async (event) => {
      event.preventDefault(); // Prevent form submission
      
      const toAddress = document.getElementById('to-address').value;
      const amount = document.getElementById('amount').value;
      
      try {
        const provider = getProvider();
        const wallet = getWallet();
        
        if (!ethers.isAddress(toAddress)) {
          throw new Error('Invalid address');
        }

        // Convert amount to Wei
        const valueWei = ethers.parseEther(amount);
        
        // Estimate gas limit for ETH transfer
        const gasLimit = await provider.estimateGas({
          to: toAddress,
          value: valueWei,
          from: wallet.address
        });

        // Show confirmation modal
        const txDetails = {
          to: toAddress,
          value: valueWei,
          gasLimit: gasLimit
        };

        try {
          const { gasPrice } = await showTransactionConfirmation(txDetails);
          
          // Send transaction with selected gas price
          const tx = await wallet.sendTransaction({
            to: toAddress,
            value: valueWei,
            gasLimit: gasLimit,
            gasPrice: gasPrice
          });

          // Wait for confirmation
          await tx.wait();
          
          // Clear form and show success
          sendForm.reset();
          alert('Transaction sent successfully!');
          
        } catch (error) {
          if (error.message === 'Transaction cancelled') {
            console.log('Transaction was cancelled by user');
            return;
          }
          throw error;
        }
        
      } catch (error) {
        console.error('Transaction error:', error);
        alert('Error sending transaction: ' + error.message);
      }
    });
  }

  // Modify createNewAccount to save accounts after creation
  export async function createNewAccount() {
    try {
      const password = prompt('Enter your password to create new account:');
      if (!password) return;

      const data = await chrome.storage.local.get(['encryptedMnemonic', 'accountCount']);
      const mnemonic = await decryptMnemonic(data.encryptedMnemonic, password);
      
      const accountIndex = data.accountCount || 0;
      
      // Create new account using HDNodeWallet
      const newWallet = ethers.HDNodeWallet.fromPhrase(
        mnemonic,
        undefined,  // no password
        `m/44'/60'/0'/0/${accountIndex}`  // derivation path
      );
      
      // Connect to provider
      const connectedAccount = newWallet.connect(_provider);
      
      // Add to accounts array
      _accounts.push(connectedAccount);
      
      // Update account count in storage
      await chrome.storage.local.set({ accountCount: accountIndex + 1 });
      
      // Switch to new account
      _currentAccountIndex = _accounts.length - 1;
      _wallet = _accounts[_currentAccountIndex];
      
      // Add this line to save the new account
      await saveAccounts();
      
      // Update UI
      displayAccountInfo();
      updateNetworkDisplay();
      
      return newWallet.address;
    } catch (error) {
      console.error('Error creating new account:', error);
      alert('Failed to create new account. Please check your password.');
      throw error;
    }
  }

  // Modify switchAccount to save the current index
  export async function switchAccount(index) {
    if (index >= 0 && index < _accounts.length) {
      _currentAccountIndex = index;
      _wallet = _accounts[index];
      
      // Update the address display in the header
      const addressDisplay = document.querySelector('.address-display');
      if (addressDisplay) {
        addressDisplay.textContent = _wallet.address;
      }
      
      await saveAccounts();
      await displayAccountInfo();
    }
  }

  function updateAccountSelector() {
    const accountSelector = document.querySelector('.account-selector select');
    if (!accountSelector) return;

    // Clear existing options
    accountSelector.innerHTML = '';

    // Add account options
    _accounts.forEach((account, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = `Account ${index + 1}`;
      accountSelector.appendChild(option);
    });

    // Add create new account option
    const createOption = document.createElement('option');
    createOption.value = 'create';
    createOption.textContent = 'Create New Account';
    createOption.className = 'create-account-option';
    accountSelector.appendChild(createOption);

    // Set current account
    accountSelector.value = _currentAccountIndex.toString();
  }

  export async function handleConnectionRequest() {
    const data = await chrome.storage.local.get(['pendingConnection', 'pendingOrigin']);
    
    if (data.pendingConnection) {
      const wallet = getWallet();
      if (!wallet) return;

      // Send approval to background script
      await chrome.runtime.sendMessage({
        type: 'CONNECTION_APPROVED',
        address: wallet.address,
        origin: data.pendingOrigin
      });

      // Close popup
      window.close();
    }
  }

  export function showConnectionRequest() {
    console.log('Showing connection request UI');
    
    // Wait for DOM to be ready
    setTimeout(() => {
      // First make sure all sections are hidden
      document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
      });

      // Show main container
      const mainContainer = document.getElementById('main-content');
      if (mainContainer) {
        mainContainer.style.display = 'block';
        mainContainer.classList.remove('hidden');
      }

      // Show connection request section
      const connectionSection = document.getElementById('connection-request-section');
      if (connectionSection) {
        connectionSection.style.display = 'block';
        connectionSection.classList.remove('hidden');
        
        // Get and display origin
        chrome.storage.local.get(['pendingOrigin'], (data) => {
          console.log('Pending origin data:', data);
          const originDisplay = document.getElementById('requesting-origin');
          if (originDisplay && data.pendingOrigin) {
            originDisplay.textContent = data.pendingOrigin;
          }

          // Add button handlers
          const approveButton = document.getElementById('approve-connection');
          const rejectButton = document.getElementById('reject-connection');

          if (approveButton) {
            approveButton.onclick = approveConnection;
          }

          if (rejectButton) {
            rejectButton.onclick = () => {
              chrome.storage.local.remove(['pendingConnection', 'pendingOrigin']);
              window.close();
            };
          }
        });
      } else {
        console.error('Connection request section not found in DOM');
      }
    }, 100); // Small delay to ensure DOM is ready
  }

  export async function approveConnection() {
    try {
        const wallet = getWallet();
        if (!wallet) throw new Error('Wallet not available');

        const data = await chrome.storage.local.get(['pendingOrigin']);
        if (!data.pendingOrigin) throw new Error('No pending connection');

        const network = await getCurrentNetwork();
        
        // Send approval to background script AND wait for confirmation
        await chrome.runtime.sendMessage({
            type: 'CONNECTION_APPROVED',
            origin: data.pendingOrigin,
            address: wallet.address.toLowerCase(),
            chainId: network?.chainId || 1
        });

        // Clear pending state
        await chrome.storage.local.remove(['pendingConnection', 'pendingOrigin']);

        // Close popup
        window.close();
    } catch (error) {
        console.error('Error approving connection:', error);
        throw error;
    }
}