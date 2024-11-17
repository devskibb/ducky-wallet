import { showSection } from "./utils.js";
import * as WalletManager from "./wallet.js";
import { ethers } from 'ethers';
import { displayTransactionHistory } from "./tokens.js";
import { getWallet, setWallet, setProvider, updateNetworkDisplay } from './wallet.js';
import { displayAccountInfo } from './wallet.js';

// Add this helper function at the top of the file
function isValidURL(string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

// Helper function to generate Blockscout API URL
function generateBlockscoutUrl(network) {
  // Known Blockscout instances
  const blockscoutNetworks = {
    // Mainnets
    1: 'eth', // Ethereum
    8453: 'base', // Base
    100: 'gnosis', // Gnosis Chain
    10: 'optimism', // Optimism
    42161: 'arbitrum', // Arbitrum One
    43114: 'avalanche', // Avalanche
    137: 'polygon', // Polygon
    56: 'bsc', // BSC
    250: 'fantom', // Fantom

    // Testnets
    11155111: 'eth-sepolia', // Sepolia
    80001: 'polygon-testnet', // Mumbai
    421613: 'arbitrum-goerli', // Arbitrum Goerli
    97: 'bsc-testnet', // BSC Testnet
    4002: 'fantom-testnet', // Fantom Testnet
    // Add more networks as needed
  };

  const networkPrefix = blockscoutNetworks[network.chainId];
  
  if (networkPrefix) {
    // Return the API URL for the network
    return `https://${networkPrefix}.blockscout.com/api/v2`;
  }

  return null;
}

export function getNetworks() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['networks'], (data) => {
        const defaultNetworks = [
          { name: 'Ethereum Mainnet', rpcUrl: 'https://eth.llamarpc.com', chainId: 1, explorerUrl: 'https://etherscan.io', symbol: 'ETH' },
          { name: 'Sepolia Testnet', rpcUrl: 'https://ethereum-sepolia.blockpi.network/v1/rpc/public', chainId: 11155111, explorerUrl: 'https://sepolia.etherscan.io', symbol: 'ETH' },
        ];
  
        // Add Blockscout URLs to networks
        const networksWithBlockscout = (data.networks || defaultNetworks).map(network => ({
          ...network,
          blockscoutUrl: generateBlockscoutUrl(network)
        }));
  
        resolve(networksWithBlockscout);
      });
    });
  }
  
  export function setNetworks(networks) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ networks: networks }, () => {
        resolve();
      });
    });
  }
  
  export function getCurrentNetworkIndex() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['currentNetwork'], (data) => {
        const currentNetworkIndex = data.currentNetwork !== undefined ? data.currentNetwork : '0';
        resolve(currentNetworkIndex);
      });
    });
  }
  
  export async function getCurrentNetwork() {
    try {
      const networks = await getNetworks();
      const index = parseInt(await getCurrentNetworkIndex());
      if (isNaN(index) || !networks[index]) {
        console.error('Invalid network index:', index);
        // Return default network if current index is invalid
        return networks[0];
      }
      return networks[index];
    } catch (error) {
      console.error('Error getting current network:', error);
      throw error;
    }
  }
  
  export function setCurrentNetwork(index) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ currentNetwork: index.toString() }, () => {
        resolve();
      });
    });
  }
  
  export async function populateNetworkSelect() {
    const networkSelect = document.getElementById('network-select');
    if (networkSelect) {
      networkSelect.innerHTML = ''; // Clear existing options
      const networks = await getNetworks();
      networks.forEach((network, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.text = network.name;
        networkSelect.appendChild(option);
      });
  
      // Set current network
      const currentNetworkIndex = await getCurrentNetworkIndex();
      networkSelect.value = currentNetworkIndex;
    } else {
      console.error('network-select element not found.');
    }
  }
  
  export async function initializeNetworkSelector() {
    const networkSelect = document.getElementById('network-select');
    if (networkSelect) {
      await populateNetworkSelect();
      
      networkSelect.addEventListener('change', async (event) => {
        try {
          const selectedValue = event.target.value;
          console.log('Network changed to:', selectedValue);

          await setCurrentNetwork(selectedValue);
          const currentNetwork = await getCurrentNetwork();
          console.log('Current network details:', currentNetwork);
          
          const provider = new ethers.JsonRpcProvider(currentNetwork.rpcUrl);
          const wallet = WalletManager.getWallet();
          
          if (wallet) {
            WalletManager.setProvider(provider);
            WalletManager.setWallet(wallet.connect(provider));
            await WalletManager.displayAccountInfo();
          }
        } catch (error) {
          console.error('Error in network switch:', error);
        }
      });
    }
  }
  
  export function toggleNetworkDropdown() {
    const networkDropdown = document.getElementById('network-dropdown');
    if (networkDropdown) {
      networkDropdown.classList.toggle('hidden');
    } else {
      console.error('Network dropdown not found.');
    }
  }
  
  export function showAddNetworkForm() {
    const mainContent = document.getElementById('main-content');
    const addNetworkSection = document.getElementById('add-network-section');
    
    if (mainContent) mainContent.classList.add('hidden');
    if (addNetworkSection) {
      addNetworkSection.classList.remove('hidden');
      addNetworkSection.innerHTML = `
        <h2>Add Custom Network</h2>
        <form id="add-network-form">
          <label for="network-name">Network Name</label>
          <input type="text" id="network-name" required>
          
          <label for="rpc-url">RPC URL</label>
          <input type="text" id="rpc-url" required>
          
          <label for="chain-id">Chain ID</label>
          <input type="number" id="chain-id" required>
          
          <label for="network-symbol">Network Symbol</label>
          <input type="text" id="network-symbol" required placeholder="ETH, BNB, MATIC, etc.">
          
          <label for="explorer-url">Block Explorer URL</label>
          <input type="text" id="explorer-url" required>
          
          <button type="submit">Add Network</button>
          <button type="button" id="back-to-dropdown-button" class="secondary-button">Back</button>
        </form>
      `;

      // Add event listeners after the form is added to the DOM
      const form = document.getElementById('add-network-form');
      const backButton = document.getElementById('back-to-dropdown-button');

      if (form) {
        form.addEventListener('submit', handleAddNetworkFormSubmit);
      }

      if (backButton) {
        backButton.addEventListener('click', () => {
          addNetworkSection.classList.add('hidden');
          mainContent.classList.remove('hidden');
        });
      }
    }
  }
  
  export async function handleAddNetworkFormSubmit(event) {
    event.preventDefault();
  
    // Get form elements
    const form = event.target;
    const networkName = form.querySelector('#network-name')?.value.trim();
    const rpcUrl = form.querySelector('#rpc-url')?.value.trim();
    const chainIdInput = form.querySelector('#chain-id')?.value.trim();
    const symbol = form.querySelector('#network-symbol')?.value.trim().toUpperCase();
    const explorerUrl = form.querySelector('#explorer-url')?.value.trim();
  
    // Validate that all form elements exist
    if (!networkName || !rpcUrl || !chainIdInput || !symbol || !explorerUrl) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'All fields are required.';
      form.prepend(errorDiv);
      return;
    }
  
    const chainId = parseInt(chainIdInput);
    if (isNaN(chainId)) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Chain ID must be a number.';
      form.prepend(errorDiv);
      return;
    }
  
    // Validate symbol format
    if (!/^[A-Z]{2,6}$/.test(symbol)) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Symbol must be 2-6 uppercase letters.';
      form.prepend(errorDiv);
      return;
    }
  
    // Validate URLs
    if (!isValidURL(rpcUrl)) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Please enter a valid RPC URL.';
      form.prepend(errorDiv);
      return;
    }
  
    if (!isValidURL(explorerUrl)) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Please enter a valid Explorer URL.';
      form.prepend(errorDiv);
      return;
    }
  
    try {
      // Test RPC connection
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const networkChainId = Number(await provider.getNetwork().then(network => network.chainId));
      
      if (Number(networkChainId) !== Number(chainId)) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `Chain ID mismatch. Network returned ${networkChainId}.`;
        form.prepend(errorDiv);
        return;
      }
  
      const customNetwork = {
        name: networkName,
        rpcUrl: rpcUrl.replace(/\/+$/, ''),
        chainId: chainId,
        symbol: symbol,
        explorerUrl: explorerUrl.replace(/\/+$/, ''),
        isCustom: true
      };
  
      // Add Blockscout URL if available for this network
      const blockscoutUrl = generateBlockscoutUrl(customNetwork);
      if (blockscoutUrl) {
        customNetwork.blockscoutUrl = blockscoutUrl;
      }
  
      const networks = await getNetworks();
      networks.push(customNetwork);
      await setNetworks(networks);
  
      // Reset form and show success
      form.reset();
      const mainContent = document.getElementById('main-content');
      const addNetworkSection = document.getElementById('add-network-section');
      
      if (mainContent && addNetworkSection) {
        addNetworkSection.classList.add('hidden');
        mainContent.classList.remove('hidden');
      }
  
      // Update network selector
      await populateNetworkSelect();
  
      // Show success message
      alert('Custom network added successfully!');
    } catch (error) {
      console.error('Error adding custom network:', error);
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Failed to connect to network. Please check your inputs.';
      form.prepend(errorDiv);
    }
  }
  
  export async function addCustomNetwork(event) {
    event.preventDefault();
  
    const name = document.getElementById('network-name').value.trim();
    const rpcUrl = document.getElementById('rpc-url').value.trim();
    const chainId = parseInt(document.getElementById('chain-id').value);
    const symbol = document.getElementById('network-symbol').value.trim().toUpperCase();
    const explorerUrl = document.getElementById('explorer-url').value.trim();
  
    const cleanRpcUrl = rpcUrl.replace(/\/+$/, '');
    const cleanExplorerUrl = explorerUrl.replace(/\/+$/, '');

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();

    // Validate inputs
    if (!name || !cleanRpcUrl || !chainId || !symbol || !cleanExplorerUrl) {
      errorDiv.textContent = 'All fields are required.';
      document.getElementById('add-network-form').prepend(errorDiv);
      return;
    }

    // Validate symbol format
    if (!/^[A-Z]{2,6}$/.test(symbol)) {
      errorDiv.textContent = 'Symbol must be 2-6 uppercase letters.';
      document.getElementById('add-network-form').prepend(errorDiv);
      return;
    }

    // Validate URLs
    try {
      new URL(cleanRpcUrl);
      new URL(cleanExplorerUrl);
    } catch (error) {
      errorDiv.textContent = 'Please enter valid URLs.';
      document.getElementById('add-network-form').prepend(errorDiv);
      return;
    }

    try {
      // Test RPC connection
      const provider = new ethers.JsonRpcProvider(cleanRpcUrl);
      const networkChainId = await provider.getNetwork().then(network => network.chainId);
      
      if (networkChainId !== chainId) {
        errorDiv.textContent = `Chain ID mismatch. Network returned ${networkChainId}.`;
        document.getElementById('add-network-form').prepend(errorDiv);
        return;
      }

      const newNetwork = {
        name,
        rpcUrl: cleanRpcUrl,
        chainId,
        symbol,
        explorerUrl: cleanExplorerUrl,
        isCustom: true
      };

      // Add Blockscout URL if available for this network
      const blockscoutUrl = generateBlockscoutUrl(newNetwork);
      if (blockscoutUrl) {
        newNetwork.blockscoutUrl = blockscoutUrl;
      }

      // Save the new network
      const { customNetworks = [] } = await chrome.storage.local.get('customNetworks');
      await chrome.storage.local.set({
        customNetworks: [...customNetworks, newNetwork]
      });

      // Update network selector and close form
      await initializeNetworkSelector();
      hideAddNetworkSection();
      
      // Show success message
      const successDiv = document.createElement('div');
      successDiv.className = 'success-message';
      successDiv.textContent = `${name} network added successfully!`;
      document.getElementById('network-dropdown').prepend(successDiv);
      setTimeout(() => successDiv.remove(), 3000);

    } catch (error) {
      console.error('Error adding network:', error);
      errorDiv.textContent = 'Failed to connect to network. Please check the RPC URL.';
      document.getElementById('add-network-form').prepend(errorDiv);
    }
  }
  
  // Add this function to check current network state
  export async function debugNetworkState() {
    const currentNetwork = await getCurrentNetwork();
    console.log('Debug - Current Network State:', {
        network: currentNetwork,
        provider: getProvider(),
        wallet: getWallet()?.address
    });
  }
