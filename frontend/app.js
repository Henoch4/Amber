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
  defaultNetwork: botMainnet,
  projectId: PROJECT_ID,
  metadata: { name: 'Amber', description: 'Liquid staking on BOT Chain', url: location.origin, icons: [location.origin + '/logo.png'] },
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
  if (typeof refreshReads === 'function') refreshReads();
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

// ---- mainnet contract (BOT Chain 677) ----
const WBOT = '0xD5452816194a3784dBa983426cCe7c122F4abd30';
const CONTRACT_ADDR = '0x80F28748BDc3Cb5AC9e7C028f6Aa7626431E2Ba1';
const ST_TOKEN = '0xf8198dfFFbC8CE67C5748985F210aA659385b4ac';
const DEPLOY_BLOCK = 26145522;
const UNSTAKE_DELAY = 2 * 86400;
const GAS = { gasPrice: ethers.parseUnits('20', 'gwei') };
const readProvider = new ethers.JsonRpcProvider('https://rpc.botchain.ai');
const AMBER_ABI = [
  'function totalStaked() view returns (uint256)',
  'function staked(address) view returns (uint256)',
  'function pendingRewards(address) view returns (uint256)',
  'function earned(address) view returns (uint256)',
  'function rewardPool() view returns (uint256)',
  'function fundRewards(uint256)',
  'function lastRewardAccrual(address) view returns (uint256)',
  'function getPendingUnstake(address) view returns (uint256,uint256)',
  'function stake(uint256)',
  'function requestUnstake(uint256)',
  'function claimUnstake()',
  'function claimReward()',
];
const ERC20_ABI = [
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function deposit() payable',
];
const fmtBot = (v) => {
  const n = Number(ethers.formatEther(v));
  if (n === 0) return '0 BOT';
  if (n >= 10000) return Math.round(n).toLocaleString() + ' BOT';
  if (n >= 1) return n.toFixed(3) + ' BOT';
  return n.toFixed(5) + ' BOT';
};
const fmtDur = (s) => {
  if (s <= 0) return 'ready';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
};

function amberRead() { return new ethers.Contract(CONTRACT_ADDR, AMBER_ABI, readProvider); }

let stakersCache = null;
async function countStakers() {
  if (stakersCache !== null) return stakersCache;
  try {
    const evs = await amberRead().queryFilter(amberRead().interface.getEvent('Stake'), DEPLOY_BLOCK);
    stakersCache = new Set(evs.map((e) => e.args[0])).size;
  } catch { stakersCache = 0; }
  return stakersCache;
}

async function refreshReads() {
  try {
    const c = amberRead();
    const [ts, stakers] = await Promise.all([c.totalStaked(), countStakers()]);
    $('statTVL').textContent = fmtBot(ts);
    $('statStakers').textContent = String(stakers);
    if (account) {
      const [st, stBal, pu, earned, pool, wb] = await Promise.all([
        c.staked(account),
        new ethers.Contract(ST_TOKEN, ERC20_ABI, readProvider).balanceOf(account),
        c.getPendingUnstake(account),
        c.earned(account),
        c.rewardPool(),
        new ethers.Contract(WBOT, ERC20_ABI, readProvider).balanceOf(account),
      ]);
      $('yourStake').textContent = fmtBot(st);
      $('yourStToken').textContent = fmtBot(stBal) + ' stBOT';
      if ($('yourWbot')) $('yourWbot').textContent = fmtBot(wb);
      const amt = pu[0], at = Number(pu[1]);
      $('pendingUnstake').textContent = amt > 0n ? fmtBot(amt) : 'none';
      if (amt > 0n) {
        const left = at + UNSTAKE_DELAY - Math.floor(Date.now() / 1000);
        $('unstakeTimer').textContent = left <= 0 ? 'ready to claim' : fmtDur(left);
      } else {
        $('unstakeTimer').textContent = '—';
      }
      $('pendingRewards').textContent = fmtBot(earned);
      if ($('rewardPool')) $('rewardPool').textContent = fmtBot(pool);
    } else {
      $('yourStake').textContent = 'connect wallet';
      $('yourStToken').textContent = 'connect wallet';
      if ($('yourWbot')) $('yourWbot').textContent = 'connect wallet';
      $('pendingUnstake').textContent = '—';
      $('unstakeTimer').textContent = '—';
      $('pendingRewards').textContent = '—';
      if ($('rewardPool')) $('rewardPool').textContent = '—';
    }
  } catch (e) { console.error('[Amber] reads failed', e); }
}

async function requireWallet() {
  if (signer && account) return true;
  const ok = await connect();
  return !!(ok && signer && account);
}

async function approveIfNeeded(amount, status) {
  const t = new ethers.Contract(WBOT, ERC20_ABI, signer);
  const a = await t.allowance(account, CONTRACT_ADDR);
  if (a < amount) {
    if (status) status('Approving WBOT…');
    const tx = await t.approve(CONTRACT_ADDR, ethers.MaxUint256, GAS);
    await tx.wait();
  }
}

async function ensureWbot(amount, status) {
  const t = new ethers.Contract(WBOT, ERC20_ABI, signer);
  const bal = await t.balanceOf(account);
  if (bal >= amount) return;
  const shortfall = amount - bal;
  const native = await signer.provider.getBalance(account);
  const gasCost = ethers.parseEther('0.007'); // deposit + approve + stake @ 20 gwei
  if (native < shortfall + gasCost) {
    const need = fmtBot(shortfall + gasCost - native);
    throw new Error(native < shortfall
      ? `Need ${need} more BOT (wrap + gas)`
      : `Need ${need} more BOT for gas`);
  }
  if (status) status('Wrapping BOT…');
  const tx = await t.deposit({ value: shortfall, ...GAS });
  await tx.wait();
}

async function runTx(btn, label, fn, errMap) {
  if (!(await requireWallet())) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Confirm in wallet…';
  try {
    const tx = await fn((m) => { btn.textContent = m; });
    btn.textContent = 'Pending…';
    await tx.wait();
    btn.textContent = '✓ ' + label;
    await refreshReads();
  } catch (e) {
    console.error('[Amber]', label, e);
    const raw = String(e.shortMessage || e.reason || e.message || 'failed');
    let msg = raw.replace(/^execution reverted:\s*/i, '').slice(0, 60);
    if (errMap) {
      for (const [re, out] of errMap) {
        if (re.test(raw)) { msg = out; break; }
      }
    }
    btn.textContent = '✗ ' + msg;
  }
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 3500);
}

function parseAmt(input) {
  try {
    const v = ethers.parseUnits((input.value || '').trim() || '0', 18);
    return v > 0n ? v : null;
  } catch { return null; }
}

function amtGuard(btn, text) {
  btn.textContent = text;
  setTimeout(() => { btn.textContent = btn.dataset.label || btn.textContent; }, 1500);
}

document.addEventListener('DOMContentLoaded', () => {
  $('contractAddr').textContent = CONTRACT_ADDR;
  refreshReads();
  setInterval(refreshReads, 30000);

  const wire = (id) => { const b = $(id); b.dataset.label = b.textContent; return b; };
  const stakeBtn = wire('stakeBtn'), unstakeBtn = wire('unstakeBtn'), claimBtn = wire('claimBtn');
  const claimUnstakeBtn = $('claimUnstakeBtn') ? wire('claimUnstakeBtn') : null;

  stakeBtn.addEventListener('click', () => {
    const amt = parseAmt($('stakeAmt'));
    if (!amt) { amtGuard(stakeBtn, 'Enter amount'); return; }
    runTx(stakeBtn, 'Staked', async (status) => {
      await ensureWbot(amt, status);
      await approveIfNeeded(amt, status);
      return amberRead().connect(signer).stake(amt, GAS);
    }, [[/insufficient balance/i, 'Not enough WBOT to stake']]);
  });
  unstakeBtn.addEventListener('click', () => {
    const amt = parseAmt($('unstakeAmt'));
    if (!amt) { amtGuard(unstakeBtn, 'Enter amount'); return; }
    runTx(unstakeBtn, 'Requested', () => amberRead().connect(signer).requestUnstake(amt, GAS));
  });
  claimBtn.addEventListener('click', () => {
    runTx(claimBtn, 'Claimed', () => amberRead().connect(signer).claimReward(GAS));
  });
  const fundBtn = $('fundBtn') ? wire('fundBtn') : null;
  if (fundBtn) {
    fundBtn.addEventListener('click', () => {
      const amt = parseAmt($('fundAmt'));
      if (!amt) { amtGuard(fundBtn, 'Enter amount'); return; }
      runTx(fundBtn, 'Funded', async () => {
        await approveIfNeeded(amt);
        return amberRead().connect(signer).fundRewards(amt, GAS);
      });
    });
  }
  if (claimUnstakeBtn) {
    claimUnstakeBtn.addEventListener('click', () => {
      runTx(claimUnstakeBtn, 'Claimed', () => amberRead().connect(signer).claimUnstake(GAS));
    });
  }
});
