import * as ethers from 'ethers';
import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const PROJECT_ID = 'f018499b1e4a94d961ab67aeeeff3254';

const botTestnet = {
  id: 968, chainNamespace: 'eip155', caipNetworkId: 'eip155:968',
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.bohr.life'] } },
  blockExplorers: { default: { name: 'BOT Scan', url: 'https://scan.bohr.life' } },
};
const botMainnet = {
  id: 677, chainNamespace: 'eip155', caipNetworkId: 'eip155:677',
  name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.botchain.ai'] } },
  blockExplorers: { default: { name: 'BOT Scan', url: 'https://scan.botchain.ai' } },
};

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [botTestnet, botMainnet],
  defaultNetwork: botTestnet,
  projectId: PROJECT_ID,
  metadata: { name: 'Amber', description: 'Liquid staking on BOT Chain', url: 'https://amber.botchain.io', icons: ['https://amber.botchain.io/logo.png'] },
  themeVariables: { '--w3m-accent': '#f59e0b' },
  features: { analytics: false },
});

let signer = null;
let account = null;
let walletProvider = null;
let _connectResolve = null;

const $ = (id) => document.getElementById(id);

function getProvider() {
  if (walletProvider) return walletProvider;
  try {
    if (modal && typeof modal.getWalletProvider === 'function') {
      const p = modal.getWalletProvider('eip155') || modal.getWalletProvider();
      if (p) { walletProvider = p; return p; }
    }
  } catch (e) {}
  return null;
}

async function syncFromProvider(wp) {
  let bp = new ethers.BrowserProvider(wp);
  signer = await bp.getSigner();
  account = await signer.getAddress();
  $('connectBtn').textContent = account.slice(0, 6) + '...' + account.slice(-4);
  console.log('[Amber] Wallet connected:', account);
}

function updateConnectedUI() {
  $('connectBtn').textContent = account ? account.slice(0, 6) + '...' + account.slice(-4) : 'Connect wallet';
}

function updateDisconnectedUI() {
  $('connectBtn').textContent = 'Connect wallet';
}

async function connect() {
  try {
    if (modal.getIsConnectedState()) {
      const wp = getProvider();
      if (wp) {
        await syncFromProvider(wp);
        updateConnectedUI();
        return true;
      }
    }
  } catch (err) {}
  const pending = new Promise((resolve) => { _connectResolve = resolve; });
  try { modal.open(); } catch (err) { _connectResolve = null; return false; }
  const timeout = new Promise((resolve) => setTimeout(() => resolve(!!signer), 120000));
  return Promise.race([pending, timeout]);
}

function onConnectClick() {
  let isConn = false;
  try { isConn = modal.getIsConnectedState(); } catch (e) {}
  if (isConn && getProvider()) {
    try { modal.open({ view: 'Account' }); } catch (e) { try { modal.open(); } catch (_) {} }
    return;
  }
  connect();
}

modal.subscribeProviders((state) => {
  if (state && state['eip155']) walletProvider = state['eip155'];
});

modal.subscribeAccount(async (state) => {
  if (state && state.isConnected && state.address) {
    account = state.address;
    const wp = getProvider();
    if (wp) {
      try {
        await syncFromProvider(wp);
        updateConnectedUI();
      } catch (e) {}
    }
    if (_connectResolve) { _connectResolve(!!signer); _connectResolve = null; }
  } else {
    const was = !!account;
    account = null; signer = null;
    updateDisconnectedUI();
    if (was) console.log('[Amber] disconnected');
    if (_connectResolve) { _connectResolve(false); _connectResolve = null; }
  }
});

modal.subscribeState((state) => {
  if (state && state.open === false && _connectResolve && !signer) {
    _connectResolve(false); _connectResolve = null;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  $('connectBtn').addEventListener('click', (e) => { e.preventDefault(); onConnectClick(); });
  $('netSel').addEventListener('change', (e) => {
    const id = parseInt(e.target.value);
    modal.switchNetwork(id === 677 ? botMainnet.caipNetworkId : botTestnet.caipNetworkId);
  });
  setTimeout(async () => {
    try {
      if (!signer && modal.getIsConnectedState()) {
        const wp = getProvider();
        if (wp) {
          await syncFromProvider(wp);
          updateConnectedUI();
        }
      }
    } catch (e) {}
  }, 800);
});
