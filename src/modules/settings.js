export function setupSettingsListeners() {
    const settingsButton = document.getElementById('settings-icon-button');
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        const mainContent = document.getElementById('main-content');
        const settingsSection = document.getElementById('settings-section');
        
        if (mainContent && settingsSection) {
          mainContent.classList.add('hidden');
          settingsSection.classList.remove('hidden');
        }
      });
    }
  
    // Add back button in settings
    const backToMainButton = document.getElementById('back-to-main');
    if (backToMainButton) {
      backToMainButton.addEventListener('click', () => {
        const mainContent = document.getElementById('main-content');
        const settingsSection = document.getElementById('settings-section');
        
        if (mainContent && settingsSection) {
          settingsSection.classList.add('hidden');
          mainContent.classList.remove('hidden');
        }
      });
    }
  
    // Add this new code for the export seed phrase button
    const exportSeedPhraseButton = document.getElementById('export-seed-phrase-button');
    if (exportSeedPhraseButton) {
      exportSeedPhraseButton.addEventListener('click', showExportPrivateKey);
    }
  }
  
  export function showExportPrivateKey() {
    const exportSection = document.getElementById('export-section');
    if (exportSection) {
      exportSection.innerHTML = `
        <div class="export-warning">
          <button id="close-export-section" class="close-button">CLOSE</button>
          <p><strong>Warning:</strong> Your private key gives full control of your account. If someone else sees it, they can steal your funds.</p>
          <p>To proceed, type the following confirmation exactly:</p>
          <p><em>"I confirm I want to view my private key. This is dangerous."</em></p>
          <input type="text" id="private-key-confirmation-input" placeholder="Type the confirmation here" required>
          <button id="confirm-export-private-key-button" class="danger-button">Confirm and View Private Key</button>
        </div>
      `;
  
      const closeExportButton = document.getElementById('close-export-section');
      if (closeExportButton) {
        closeExportButton.addEventListener('click', () => {
          exportSection.classList.add('hidden');
        });
      }
  
      const confirmButton = document.getElementById('confirm-export-private-key-button');
      if (confirmButton) {
        confirmButton.addEventListener('click', async () => {
          const confirmationInput = document.getElementById('private-key-confirmation-input').value.trim();
          const requiredConfirmation = 'I confirm I want to view my private key. This is dangerous.';
  
          if (confirmationInput !== requiredConfirmation) {
            alert('Incorrect confirmation. Private key will not be displayed.');
            return;
          }
  
          try {
            // Import the getWallet function
            const { getWallet } = await import('./wallet.js');
            const wallet = getWallet();
            
            if (!wallet) {
              throw new Error('Wallet not available');
            }
  
            exportSection.innerHTML = `
              <div class="seed-phrase-display">
                <button id="close-seed-display" class="close-button">CLOSE</button>
                <p>Your private key is:</p>
                <p class="seed-phrase"><strong>${wallet.privateKey}</strong></p>
                <p>Keep it safe and do not share it with anyone.</p>
              </div>
            `;
  
            document.getElementById('close-seed-display').addEventListener('click', () => {
              exportSection.classList.add('hidden');
            });
          } catch (error) {
            alert('Unable to access private key. Please ensure your wallet is unlocked.');
            exportSection.classList.add('hidden');
          }
        });
      }
  
      exportSection.classList.remove('hidden');
    }
  }