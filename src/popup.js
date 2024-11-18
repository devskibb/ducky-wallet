/******************************************************************************
 * IMPORTS AND CONSTANTS
 ******************************************************************************/
import { ethers } from 'ethers';
import { ERC20_ABI } from './modules/constants';
import { showSection } from './modules/utils.js';
import * as WalletManager from './modules/wallet.js';
import * as NetworkManager from './modules/network.js'
import { showTransactionConfirmation } from './modules/transactions.js';
import { initializeLogoAnimation } from './modules/animation.js';

/******************************************************************************
 * GLOBAL VARIABLES
 ******************************************************************************/

/******************************************************************************
 * CORE APPLICATION SETUP
 ******************************************************************************/
window.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('Initializing popup');
  initializeLogoAnimation();
  setupEventListeners();
  
  // Check if we're opening for a connection request
  const isConnectionRequest = window.location.hash === '#connection-request';
  console.log('Is connection request:', isConnectionRequest);
  
  if (isConnectionRequest) {
    // Check wallet status first
    const isUnlocked = await WalletManager.checkWallet();
    console.log('Wallet unlocked:', isUnlocked);
    
    if (isUnlocked) {
      WalletManager.showConnectionRequest();
    } else {
      WalletManager.displayUnlockWallet(true);
    }
  } else {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.classList.remove('hidden');
    }
    await WalletManager.checkWallet();
  }
  
  WalletManager.updateNetworkDisplay();
  NetworkManager.initializeNetworkSelector();
}

function setupEventListeners() {
  // Settings icon
  const settingsIcon = document.getElementById('settings-icon');
  if (settingsIcon) {
    settingsIcon.addEventListener('click', () => showSection('settings-section'));
  } else {
    console.error('Settings icon not found.');
  }

  // Back buttons
  const backToMainButton = document.getElementById('back-to-main-button');
  const backToDropdownButton = document.getElementById('back-to-dropdown-button');

  if (backToMainButton) {
    backToMainButton.addEventListener('click', () => showSection('main-content'));
  } else {
    console.error('Back to main button not found.');
  }

  if (backToDropdownButton) {
    backToDropdownButton.addEventListener('click', () => showSection('main-content'));
  } else {
    console.error('Back to dropdown button not found.');
  }

  // Network selector button
  const networkSelectorButton = document.getElementById('network-selector-button');
  if (networkSelectorButton) {
    networkSelectorButton.addEventListener('click', NetworkManager.toggleNetworkDropdown);
  } else {
    console.error('Network selector button not found.');
  }

  // Add network button within dropdown
  const addNetworkButton = document.getElementById('add-network-button');
  if (addNetworkButton) {
    addNetworkButton.addEventListener('click', NetworkManager.showAddNetworkForm);
  } else {
    console.error('Add network button not found.');
  }

  // Add network form submission
  const addNetworkForm = document.getElementById('add-network-form');
  if (addNetworkForm) {
    addNetworkForm.addEventListener('submit', NetworkManager.handleAddNetworkFormSubmit);
  } else {
    console.error('Add network form not found.');
  }

  // Activity tracking for wallet locking
  document.addEventListener('mousemove', WalletManager.resetLockTimer);
  document.addEventListener('keydown', WalletManager.resetLockTimer);

  // Update the send form listener
  const sendForm = document.getElementById('send-form');
  if (sendForm) {
    sendForm.addEventListener('submit', handleSendTransaction);
  } else {
    console.error('Send form not found.');
  }

  const exportPrivateKeyButton = document.getElementById('export-seed-phrase-button');
  if (exportPrivateKeyButton) {
    exportPrivateKeyButton.addEventListener('click', () => {
      const { showExportPrivateKey } = require('./modules/settings.js');
      showExportPrivateKey();
    });
  }

  // Add network selector listener
  const networkSelect = document.getElementById('network-select');
  if (networkSelect) {
    networkSelect.addEventListener('change', async (e) => {
      console.log('Network change triggered');
      const newNetworkId = parseInt(e.target.value);
      console.log('New network ID:', newNetworkId);
      
      try {
        await NetworkManager.setCurrentNetwork(newNetworkId);
        const network = await NetworkManager.getCurrentNetwork();
        console.log('Switched to network:', network);
        
        // Update provider using WalletManager
        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        WalletManager.setProvider(provider);
        
        const wallet = WalletManager.getWallet();
        if (wallet) {
          WalletManager.setWallet(wallet.connect(provider));
        }
        
        // Update displays
        WalletManager.updateNetworkDisplay();
        await WalletManager.displayAccountInfo();
        
        // Close the dropdown
        const dropdown = document.getElementById('network-dropdown');
        if (dropdown) {
          dropdown.classList.add('hidden');
        }
      } catch (error) {
        console.error('Error switching network:', error);
      }
    });
  }
}

async function handleSendTransaction(event) {
  event.preventDefault();
  
  const toAddress = document.getElementById('to-address').value;
  const amount = document.getElementById('amount').value;
  
  try {
    const provider = WallgetProvider();
    const wallet = WalletManager.getWallet();
    
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
      event.target.reset();
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
}

/******************************************************************************
 * ACCOUNT & TRANSACTION MANAGEMENT
 ******************************************************************************/


/******************************************************************************
 * NETWORK MANAGEMENT
 ******************************************************************************/

/******************************************************************************
 * TOKEN MANAGEMENT
 ******************************************************************************/

/******************************************************************************
 * SETTINGS & SECURITY
 ******************************************************************************/

/******************************************************************************
 * UTILITY FUNCTIONS
 ******************************************************************************/


