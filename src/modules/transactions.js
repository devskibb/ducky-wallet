import { ethers } from 'ethers';
import { getWallet, getProvider } from './wallet.js';
import { getCurrentNetwork } from './network.js';

export async function estimateGasPrices() {
  const provider = getProvider();
  const baseFeePerGas = await provider.getFeeData();
  
  // Calculate gas prices for different speeds
  const slow = baseFeePerGas.gasPrice * BigInt(8) / BigInt(10); // 80% of base fee
  const standard = baseFeePerGas.gasPrice; // 100% of base fee
  const fast = baseFeePerGas.gasPrice * BigInt(12) / BigInt(10); // 120% of base fee
  const rapid = baseFeePerGas.gasPrice * BigInt(15) / BigInt(10); // 150% of base fee
  
  return {
    slow: {
      gasPrice: slow,
      label: 'Slow',
      estimatedTime: '5-10 mins'
    },
    standard: {
      gasPrice: standard,
      label: 'Standard',
      estimatedTime: '2-5 mins'
    },
    fast: {
      gasPrice: fast,
      label: 'Fast',
      estimatedTime: '30-60 secs'
    },
    rapid: {
      gasPrice: rapid,
      label: 'Rapid',
      estimatedTime: '15-30 secs'
    }
  };
}

export async function showTransactionConfirmation(txDetails) {
  console.log('Showing transaction confirmation modal:', txDetails);
  
  if (!txDetails || !txDetails.gasLimit) {
    console.error('Invalid transaction details:', txDetails);
    throw new Error('Invalid transaction details');
  }

  try {
    const gasPrices = await estimateGasPrices();
    console.log('Estimated gas prices:', gasPrices);
    
    return new Promise((resolve, reject) => {
      const modal = document.createElement('div');
      modal.className = 'transaction-modal';
      
      // Helper function to truncate addresses
      function truncateAddress(address) {
        return address.slice(0, 6) + '...' + address.slice(-4);
      }
      
      const modalContent = `
        <div class="transaction-confirmation">
          <h3>Confirm Transaction</h3>
          
          <div class="transaction-details">
            <div class="detail-row">
              <span>From:</span>
              <span class="address" title="${getWallet().address}">${truncateAddress(getWallet().address)}</span>
            </div>
            <div class="detail-row">
              <span>To:</span>
              <span class="address" title="${txDetails.to}">${truncateAddress(txDetails.to)}</span>
            </div>
            <div class="detail-row">
              <span>Amount:</span>
              <span>${txDetails.token ? 
                ethers.formatUnits(txDetails.token.amount, txDetails.token.decimals) + ' ' + txDetails.token.symbol :
                ethers.formatEther(txDetails.value) + ' ETH'
              }</span>
            </div>
          </div>

          <div class="gas-selection">
            <h4>Select Gas Price</h4>
            <div class="gas-options">
              ${Object.entries(gasPrices).map(([speed, data]) => `
                <div class="gas-option">
                  <input type="radio" name="gas-speed" id="${speed}-gas" 
                         value="${data.gasPrice}" ${speed === 'standard' ? 'checked' : ''}>
                  <label for="${speed}-gas">
                    <div class="speed-name">${speed.charAt(0).toUpperCase() + speed.slice(1)}</div>
                    <div class="gas-details">
                      <span class="gas-price">${ethers.formatUnits(data.gasPrice, 'gwei')} Gwei</span>
                      <span class="estimate-time">${data.estimatedTime}</span>
                    </div>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="transaction-summary">
            <div class="summary-row">
              <span>Fee:</span>
              <span id="estimated-fee">Calculating...</span>
            </div>
            <div class="summary-row total">
              <span>Total:</span>
              <span id="total-amount">Calculating...</span>
            </div>
          </div>

          <div class="modal-actions">
            <button id="confirm-transaction" class="primary">Confirm</button>
            <button id="cancel-transaction" class="secondary">Cancel</button>
          </div>
        </div>
      `;
      
      modal.innerHTML = modalContent;
      document.body.appendChild(modal);
      
      setupTransactionModalListeners(modal, txDetails, gasPrices);
      
      // Handle confirmation
      modal.querySelector('#confirm-transaction').addEventListener('click', () => {
        const selectedGasPrice = getSelectedGasPrice(modal);
        modal.remove();
        resolve({ gasPrice: selectedGasPrice });
      });
      
      // Handle cancellation
      modal.querySelector('#cancel-transaction').addEventListener('click', () => {
        modal.remove();
        reject(new Error('Transaction cancelled'));
      });
      
    });
    
  } catch (error) {
    console.error('Error showing transaction confirmation:', error);
    throw error;
  }
}

function setupTransactionModalListeners(modal, txDetails, gasPrices) {
  const estimatedFeeElement = modal.querySelector('#estimated-fee');
  const totalAmountElement = modal.querySelector('#total-amount');

  modal.querySelectorAll('input[name="gas-speed"]').forEach(input => {
    input.addEventListener('change', updateEstimates);
  });

  function updateEstimates() {
    const selectedGasPrice = getSelectedGasPrice(modal);
    const estimatedFee = selectedGasPrice * txDetails.gasLimit;
    
    estimatedFeeElement.textContent = `${ethers.formatEther(estimatedFee)} ETH`;
    
    const total = txDetails.token 
      ? estimatedFee
      : estimatedFee + BigInt(txDetails.value);
    
    totalAmountElement.textContent = `${ethers.formatEther(total)} ETH`;
  }

  updateEstimates();
}

function getSelectedGasPrice(modal) {
  const selectedOption = modal.querySelector('input[name="gas-speed"]:checked');
  if (!selectedOption) {
    throw new Error('No gas price selected');
  }
  return BigInt(selectedOption.value);
}

export async function showTransactionSuccess(txHash) {
  const network = await getCurrentNetwork();  
  if (!network || !network.explorerUrl) {
    console.error('Network or explorer URL not found:', network);
    return `
      <div class="transaction-success">
        <span class="success-message">Transaction successful!</span>
        <span class="tx-hash">Transaction hash: ${txHash}</span>
      </div>
    `;
  }

  const explorerUrl = `${network.explorerUrl}/tx/${txHash}`;
  const truncatedHash = txHash.slice(0, 6) + '...' + txHash.slice(-4);
  
  return `
    <div class="transaction-success">
      <span class="success-message">Transaction successful!</span>
      <a href="${explorerUrl}" target="_blank" class="tx-hash">
        View transaction: ${truncatedHash}
      </a>
    </div>
  `;
} 