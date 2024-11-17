export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const addressDiv = document.getElementById('address');
      if (addressDiv) {
        addressDiv.classList.add('copied');
        setTimeout(() => {
          addressDiv.classList.remove('copied');
        }, 2000); // Remove the class after 2 seconds
      }
      showCopyNotification();
    }).catch(err => {
      console.error('Could not copy text: ', err);
      alert('Failed to copy address.');
    });
  }
  
  export function showCopyNotification() {
    // Remove any existing notifications first
    const existingNotification = document.querySelector('.copy-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = 'Address copied to clipboard!';
    
    // Append to body instead of app div for absolute positioning
    document.body.appendChild(notification);

    // Remove the notification after animation
    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  export function isValidURL(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  export function showSection(sectionId) {
    const allSections = [
      'main-content',
      'settings-section',
      'add-network-section',
      'export-section',
      'send-section'
    ];
  
    allSections.forEach(id => {
      const section = document.getElementById(id);
      if (section) {
        if (id === sectionId) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }
    });
  
    const settingsIconContainer = document.getElementById('settings-icon-container');
    if (settingsIconContainer) {
      if (sectionId === 'settings-section') {
        settingsIconContainer.classList.add('hidden');
      } else {
        settingsIconContainer.classList.remove('hidden');
      }
    }
  
    const networkDropdown = document.getElementById('network-dropdown');
    if (networkDropdown && !networkDropdown.classList.contains('hidden')) {
      networkDropdown.classList.add('hidden');
    }
  
    const networkSelectorContainer = document.getElementById('network-selector-container');
    if (networkSelectorContainer) {
      if (sectionId === 'main-content') {
        networkSelectorContainer.classList.remove('hidden');
      } else {
        networkSelectorContainer.classList.add('hidden');
      }
    }
  
    if (sectionId === 'main-content') {
      const tokensSection = document.getElementById('tokens-section');
      const wallet = WalletManager.getWallet();
      if (wallet) {
        if (tokensSection) {
          tokensSection.classList.remove('hidden');
        }
      }
    }
  }
  