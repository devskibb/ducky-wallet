import { ethers } from 'ethers';
import { getCurrentNetwork } from './network.js';
import { getProvider, getWallet } from './wallet.js';
import { showTransactionConfirmation, showTransactionSuccess } from './transactions.js';

// Add this helper function at the top of the file
function getExplorerUrl(txHash) {
  const network = getCurrentNetwork();
  return `${network.blockExplorer}/tx/${txHash}`;
}

export async function loadTokens() {
  const tokensSection = document.getElementById('tokens-section');
  if (!tokensSection) return;

  // Clear existing content first
  tokensSection.innerHTML = `
    <div class="tabs">
      <button class="tab-button active" data-tab="tokens">Tokens</button>
    </div>
    <div id="tokens-content" class="token-content active">
      <div id="tokens-list"></div>
      <button id="add-token-button" class="secondary-button">Add Token</button>
    </div>
  `;

  // Add click handler for the tokens tab
  const tabButton = document.querySelector('#tokens-section .tab-button');
  const tokensContent = document.getElementById('tokens-content');
  const addTokenButton = document.getElementById('add-token-button');

  tabButton.addEventListener('click', () => {
    const isVisible = tokensContent.style.display !== 'none';
    tokensContent.style.display = isVisible ? 'none' : 'block';
    addTokenButton.style.display = isVisible ? 'none' : 'block';
    tabButton.classList.toggle('active', !isVisible);
  });

  // Set initial state
  tokensContent.style.display = 'block';
  addTokenButton.style.display = 'block';

  // Add token button event listener
  document.getElementById('add-token-button').addEventListener('click', showAddTokenForm);

  // Load tokens for current network
  await displayTokens();
}

// New helper function to handle token display
async function displayTokens() {
  const tokensList = document.getElementById('tokens-list');
  if (!tokensList) return;

  const network = await getCurrentNetwork();
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['tokens'], resolve);
  });

  const tokens = data.tokens || {};
  const networkTokens = tokens[network.chainId] || [];

  if (networkTokens.length === 0) {
    tokensList.innerHTML = '<div class="no-tokens">No tokens added</div>';
    return;
  }

  // Clear existing tokens first
  tokensList.innerHTML = '';
  
  const wallet = getWallet();
  const provider = getProvider();
  
  for (const token of networkTokens) {
    try {
      const contract = new ethers.Contract(
        token.address,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await contract.balanceOf(wallet.address);
      const formattedBalance = ethers.formatUnits(balance, token.decimals);

      const tokenElement = document.createElement('div');
      tokenElement.className = 'token-item';
      tokenElement.dataset.token = JSON.stringify(token);
      tokenElement.innerHTML = `
        <div class="token-symbol">${token.symbol}</div>
        <div class="token-balance">${formattedBalance}</div>
      `;
      
      tokenElement.addEventListener('click', () => showTokenSendForm(token));
      tokensList.appendChild(tokenElement);
    } catch (error) {
      console.error(`Error loading token ${token.symbol}:`, error);
    }
  }
}

function showAddTokenForm() {
  const form = document.createElement('div');
  form.className = 'modal';
  form.innerHTML = `
    <div class="modal-content">
      <h3>Add Token</h3>
      <label for="token-address">Token Contract Address:</label>
      <input type="text" id="token-address" placeholder="0x...">
      <label for="token-symbol">Token Symbol:</label>
      <input type="text" id="token-symbol" placeholder="e.g., USDT">
      <label for="token-decimals">Decimals:</label>
      <input type="number" id="token-decimals" value="18">
      <div class="button-group">
        <button id="add-token-submit">Add</button>
        <button id="cancel-add-token" class="secondary-button">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(form);

  document.getElementById('add-token-submit').addEventListener('click', addNewToken);
  document.getElementById('cancel-add-token').addEventListener('click', () => form.remove());
}

async function addNewToken() {
  const address = document.getElementById('token-address').value.trim();
  const symbol = document.getElementById('token-symbol').value.trim();
  const decimals = document.getElementById('token-decimals').value;

  try {
    // Validate address
    ethers.getAddress(address);

    // Get current network
    const network = await getCurrentNetwork();

    // Get existing tokens
    const data = await new Promise(resolve => {
      chrome.storage.local.get(['tokens'], resolve);
    });

    const tokens = data.tokens || {};
    const networkTokens = tokens[network.chainId] || [];

    // Check if token already exists
    if (networkTokens.some(t => t.address.toLowerCase() === address.toLowerCase())) {
      throw new Error('Token already exists');
    }

    // Add new token
    networkTokens.push({
      address,
      symbol,
      decimals: parseInt(decimals),
    });

    tokens[network.chainId] = networkTokens;

    // Save updated tokens
    await new Promise(resolve => {
      chrome.storage.local.set({ tokens }, resolve);
    });

    // Remove form and reload tokens
    document.querySelector('.modal').remove();
    await loadTokens();

  } catch (error) {
    alert(error.message);
  }
}

// Add new function to handle token sends:
async function showTokenSendForm(token) {
  const sendSection = document.getElementById('send-section');
  const sendButton = document.getElementById('send-button');
  if (!sendSection) return;

  if (sendButton) sendButton.style.display = 'none';

  const provider = getProvider();
  const wallet = getWallet();
  
  // Get current balance
  const contract = new ethers.Contract(
    token.address,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const balance = await contract.balanceOf(wallet.address);
  const formattedBalance = ethers.formatUnits(balance, token.decimals);
  
  const network = await getCurrentNetwork();
  const scannerUrl = `${network.explorerUrl}/token/${token.address}`;
  
  // Truncate the address: show first 6 and last 4 characters
  const truncatedAddress = `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;

  sendSection.innerHTML = `
    <div class="token-send-form">
      <button id="back-to-tokens" class="back-button">
        <svg class="back-icon" viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        Back
      </button>
      <h3>Send ${token.symbol}</h3>
      <div class="token-details">
        <p>Balance: ${formattedBalance} ${token.symbol}</p>
        <p>Contract: <a href="${scannerUrl}" target="_blank" title="${token.address}">${truncatedAddress}</a></p>
      </div>
      <div class="send-form-content">
        <label for="to-address">To Address:</label>
        <input type="text" id="to-address" placeholder="0x...">
        
        <label for="amount">Amount:</label>
        <div class="amount-input-container">
          <input type="number" id="amount" step="any" placeholder="0.0">
          <button id="max-amount">Max</button>
        </div>
        
        <div id="error-message" class="error-message hidden"></div>
        <div id="success-message" class="success-message hidden"></div>
        
        <button id="send-token">Send ${token.symbol}</button>
      </div>
    </div>
  `;

  // Add styles for the token details
  const style = document.createElement('style');
  style.textContent = `
    .back-button {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .back-icon {
      min-width: 16px;
    }
    .token-details a {
      color: #1a5bbc;
      text-decoration: none;
      font-family: monospace;
    }
    .token-details a:hover {
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);

  // Show send section and hide tokens section
  sendSection.classList.remove('hidden');
  document.getElementById('tokens-section').classList.add('hidden');

  // Add event listeners
  document.getElementById('back-to-tokens').addEventListener('click', () => {
    sendSection.classList.add('hidden');
    document.getElementById('tokens-section').classList.remove('hidden');
    if (sendButton) sendButton.style.display = 'block';
  });

  document.getElementById('max-amount').addEventListener('click', () => {
    document.getElementById('amount').value = formattedBalance;
  });

  document.getElementById('send-token').addEventListener('click', async () => {
    const toAddress = document.getElementById('to-address').value.trim();
    const amount = document.getElementById('amount').value;
    const errorElement = document.getElementById('error-message');
    const successElement = document.getElementById('success-message');
    const sendButton = document.getElementById('send-token');
    
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

      // Validate address
      ethers.getAddress(toAddress);

      // Validate amount
      const parsedAmount = ethers.parseUnits(amount, token.decimals);
      if (parsedAmount > balance) {
        throw new Error('Insufficient balance');
      }

      // Get wallet instance
      const wallet = getWallet();
      if (!wallet) {
        throw new Error('Wallet not connected');
      }

      // Create contract instance with full ABI for transfer
      const minABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];

      const contractWithSigner = new ethers.Contract(
        token.address,
        minABI,
        wallet
      );

      // Get the function data for gas estimation
      const data = contractWithSigner.interface.encodeFunctionData("transfer", [toAddress, parsedAmount]);

      // Estimate gas using wallet
      const gasLimit = await wallet.estimateGas({
        to: token.address,
        data: data
      });

      // Show confirmation modal
      const txDetails = {
        to: token.address,
        value: "0",
        token: {
          ...token,
          amount: parsedAmount
        },
        gasLimit: gasLimit
      };

      const { gasPrice } = await showTransactionConfirmation(txDetails);

      // Send transaction
      const tx = await contractWithSigner.transfer(toAddress, parsedAmount, {
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
      sendButton.textContent = `Send ${token.symbol}`;
      sendButton.disabled = false;

    } catch (error) {
      // Reset button
      sendButton.textContent = `Send ${token.symbol}`;
      sendButton.disabled = false;
      
      // Show error
      errorElement.textContent = error.message;
      errorElement.classList.remove('hidden');
    }
  });
}

// Add this function to handle navigation state
export function handleTokenNavigation() {
  const mainContent = document.getElementById('main-content');
  if (mainContent.dataset.currentToken) {
    const token = JSON.parse(mainContent.dataset.currentToken);
    showTokenSendForm(token);
    return true;
  }
  return false;
}

async function getTransactionHistory(address) {
  try {
    const network = await getCurrentNetwork();
    
    if (!network.blockscoutUrl) {
      console.log(`Blockscout not supported for network: ${network.name} (Chain ID: ${network.chainId})`);
      return [];
    }

    const url = `${network.blockscoutUrl}/addresses/${address}/transactions`;
    console.log('Fetching transactions from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items.map(tx => ({
      hash: tx.hash,
      from: tx.from.hash,
      to: tx.to?.hash,
      value: tx.value,
      timestamp: new Date(tx.timestamp).getTime() / 1000,
      isReceived: tx.to?.hash.toLowerCase() === address.toLowerCase()
    }));

  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
}

export async function displayTransactionHistory() {
    const transactionList = document.querySelector('.transaction-list');
    if (!transactionList) return;

    const wallet = getWallet();
    if (!wallet) return;

    transactionList.innerHTML = '<div class="loading">Loading transactions...</div>';

    try {
        const transactions = await getTransactionHistory(wallet.address);
        
        if (transactions.length === 0) {
            transactionList.innerHTML = '<div class="no-transactions">No transactions found</div>';
            return;
        }

        const txElements = await Promise.all(transactions.map(createTransactionElement));
        transactionList.innerHTML = txElements.join('');

    } catch (error) {
        console.error('Error displaying transactions:', error);
        transactionList.innerHTML = '<div class="error">Error loading transactions</div>';
    }
}

async function createTransactionElement(tx) {
    const wallet = getWallet();
    const network = await getCurrentNetwork();
    
    const isReceived = tx.to?.toLowerCase() === wallet.address.toLowerCase();
    const timestamp = new Date(tx.timestamp * 1000).toLocaleString();
    
    let amount, symbol;
    if (tx.type === 'token') {
        amount = ethers.formatUnits(tx.value, tx.tokenDecimals);
        symbol = tx.tokenSymbol;
    } else {
        amount = ethers.formatEther(tx.value);
        symbol = 'ETH';
    }
    
    return `
        <div class="transaction-item ${isReceived ? 'received' : 'sent'}">
            <div class="tx-type">${isReceived ? 'IN' : 'OUT'}</div>
            <div class="tx-amount">${amount} ${symbol}</div>
            <div class="tx-address">${isReceived ? 'From: ' + tx.from : 'To: ' + tx.to}</div>
            <div class="tx-hash">
                <a href="${network.explorerUrl}/tx/${tx.hash}" target="_blank">
                    ${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}
                </a>
            </div>
            <div class="tx-timestamp">${timestamp}</div>
        </div>
    `;
}

async function sendToken(token, toAddress, amount) {
  try {
    const wallet = getWallet();
    
    // Create contract instance with full ABI for transfer
    const minABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const contractWithSigner = new ethers.Contract(
      token.address,
      minABI,
      wallet
    );

    // Parse amount using token decimals
    const parsedAmount = ethers.parseUnits(amount.toString(), token.decimals);

    // Get the function data for gas estimation
    const data = contractWithSigner.interface.encodeFunctionData("transfer", [toAddress, parsedAmount]);

    // Estimate gas using wallet
    const gasLimit = await wallet.estimateGas({
      to: token.address,
      data: data
    });

    // Show confirmation modal
    const txDetails = {
      to: token.address,
      value: "0",
      token: {
        ...token,
        amount: parsedAmount
      },
      gasLimit: gasLimit
    };

    const { gasPrice } = await showTransactionConfirmation(txDetails);

    // Send transaction
    const tx = await contractWithSigner.transfer(toAddress, parsedAmount, {
      gasLimit: gasLimit,
      gasPrice: gasPrice
    });
    
    await tx.wait();
    return tx.hash;
  } catch (error) {
    console.error('Token transfer error:', error);
    throw error;
  }
}
