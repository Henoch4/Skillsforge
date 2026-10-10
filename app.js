import { ethers } from 'ethers';
import { AppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const PROJECT_ID = 'f018499b1e4a94d961ab67aeeeff3254';

const botTestnet = {
  id: 968,
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.bohr.life'] } },
  blockExplorers: { default: { name: 'BOTScan Testnet', url: 'https://scan.bohr.life' } },
  testnet: true,
};
const botMainnet = {
  id: 677,
  name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.botchain.ai'] } },
  blockExplorers: { default: { name: 'BOTScan', url: 'https://scan.botchain.ai' } },
};

const SK_ABI = [
  'function totalSkills() view returns (uint256)',
  'function totalReceipts() view returns (uint256)',
  'function totalVolume() view returns (uint256)',
  'function treasury() view returns (address)',
  'function publish(string,uint256)',
  'function setPrice(uint256,uint256)',
  'function useSkill(uint256,address)',
  'function confirmSuccess(uint256)',
  'function disputeExecution(uint256)',
  'function resolveDispute(uint256,bool)',
  'function getSkill(uint256) view returns (address,string,uint256,uint16,bool,uint256,uint256)',
  'function getReceipt(uint256) view returns (uint256,address,address,uint256,uint64,uint8)',
  'function successCount(address) view returns (uint256)',
  'function failCount(address) view returns (uint256)',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function deposit() payable',
  'function allowance(address,address) view returns (uint256)',
];

const CONTRACTS = {
  968: {
    sk: '0x21809f45ad2Aac2eb24fd017cEBfecf4eE689149',
    wbot: '0xD8FBaBf44B2dbb427d881F8Ea66F14D8287A55c0',
  },
  677: {
    sk: '0x6374E48A1196Bdb5AD05F3C1Ca6C8042f84Db88E',
    wbot: '0xD5452816194a3784dBa983426cCe7c122F4abd30',
  },
};

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 18) => Number(ethers.formatUnits(n, d)).toLocaleString(undefined, { maximumFractionDigits: 4 });
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';

function getProvider() {
  try {
    if (typeof appkit !== 'undefined' && appkit && typeof appkit.getWalletProvider === 'function') {
      const p = appkit.getWalletProvider('eip155') || appkit.getWalletProvider();
      if (p) return p;
    }
  } catch (e) {}
  return null;
}
async function getSigner() {
  const wp = getProvider();
  if (!wp) { try { appkit.open(); } catch (e) {} return null; }
  return new ethers.BrowserProvider(wp).getSigner();
}
const STATE = ['open', 'success', 'disputed'];

let appkit = null;
let readProvider;
let currentChainId = 677;
let account = null;

function initAppKit() {
  if (!$('connectBtn')) return;
  const adapter = new EthersAdapter();
  appkit = new AppKit({
    networks: [botTestnet, botMainnet],
    adapters: [adapter],
    projectId: PROJECT_ID,
    themeMode: 'dark',
    metadata: { name: 'SkillForge', description: 'Agent skills marketplace on BOT Chain', url: location.origin, icons: [] },
  });
  appkit.subscribeAccount((state) => {
    account = state.address || null;
    $('connectBtn').textContent = account ? short(account) : 'Connect wallet';
    refresh();
  });
  $('connectBtn').addEventListener('click', () => appkit.open());
  if ($('netSel')) {
    $('netSel').addEventListener('change', (e) => {
      currentChainId = Number(e.target.value);
      refresh();
    });
  }
}

function contract() {
  const c = CONTRACTS[currentChainId];
  if (!c) return null;
  return new ethers.Contract(c.sk, SK_ABI, readProvider);
}

async function signerOrAlert() {
  if (!account) { appkit?.open(); return null; }
  if (!CONTRACTS[currentChainId]) { alert('No contracts on this network. Switch to BOT Chain 677 or Testnet 968.'); return null; }
  const s = await getSigner();
  if (!s) { appkit?.open(); return null; }
  return s;
}

async function ensureAllowance(spender, amount) {
  const s = await signerOrAlert();
  if (!s) return false;
  const c = CONTRACTS[currentChainId];
  const token = new ethers.Contract(c.wbot, ERC20_ABI, s);
  const owner = await s.getAddress();
  const allow = await token.allowance(owner, spender);
  if (allow >= amount) return true;
  const tx = await token.approve(spender, ethers.MaxUint256, { gasPrice: ethers.parseUnits('20', 'gwei'), gasLimit: 600000n });
  await tx.wait();
  return true;
}

async function refresh() {
  const sk = contract();
  if (!sk) return;
  try {
    if ($('stSkills')) {
      const [skills, receipts, volume] = await Promise.all([sk.totalSkills(), sk.totalReceipts(), sk.totalVolume()]);
      $('stSkills').textContent = String(skills);
      $('stReceipts').textContent = String(receipts);
      $('stVolume').textContent = fmt(volume);
    }
    if ($('skList')) await renderSkills(sk);
    if ($('rcList')) await renderReceipts(sk);
    if ($('repOut')) await renderRep(sk);
  } catch (e) {
    console.error(e);
  }
}

async function renderSkills(sk) {
  const total = await sk.totalSkills();
  const c = CONTRACTS[currentChainId];
  let html = '';
  for (let i = 0n; i < total; i++) {
    const s = await sk.getSkill(i);
    const [pub, uri, price, ver, active, uses, earned] = s;
    html += `<div class="item">
      <div><b>#${i}</b> ${uri.length > 42 ? uri.slice(0, 40) + '…' : uri}</div>
      <div class="mono">${fmt(price)} WBOT/use · v${ver} · ${uses} runs · earned ${fmt(earned)}</div>
      <div class="mono">publisher ${short(pub)} ${active ? '' : '· inactive'}</div>
    </div>`;
  }
  $('skList').innerHTML = html || '<div class="empty">No skills yet — publish the first one.</div>';
}

async function renderReceipts(sk) {
  const total = await sk.totalReceipts();
  let html = '';
  for (let i = 0n; i < total; i++) {
    const r = await sk.getReceipt(i);
    const [skillId, buyer, agent, paid, at, state] = r;
    html += `<div class="item">
      <div><b>receipt #${i}</b> · skill #${skillId} · ${STATE[state] ?? state}</div>
      <div class="mono">buyer ${short(buyer)} → agent ${short(agent)} · ${fmt(paid)} WBOT</div>
    </div>`;
  }
  $('rcList').innerHTML = html || '<div class="empty">No receipts yet.</div>';
}

async function renderRep(sk) {
  const addr = $('repAddr').value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { $('repOut').innerHTML = '<div class="empty">Enter a 0x… address.</div>'; return; }
  const [ok, bad] = await Promise.all([sk.successCount(addr), sk.failCount(addr)]);
  const score = Number(ok) * 10 - Number(bad) * 5;
  $('repOut').innerHTML = `<div class="item"><div><b>Reputation</b> · score ${score}</div><div class="mono">confirmed runs: ${ok} · dispute losses: ${bad}</div></div>`;
}

async function doPublish() {
  const s = await signerOrAlert();
  if (!s) return;
  const uri = $('pubUri').value.trim();
  const price = $('pubPrice').value.trim();
  if (!uri || !price || Number(price) <= 0) return alert('Metadata URI and price are required.');
  const c = CONTRACTS[currentChainId];
  const sk = new ethers.Contract(c.sk, SK_ABI, s);
  const tx = await sk.publish(uri, ethers.parseEther(price), { gasPrice: ethers.parseUnits('20', 'gwei'), gasLimit: 600000n });
  await tx.wait();
  refresh();
}

async function doUse() {
  const s = await signerOrAlert();
  if (!s) return;
  const id = $('useId').value.trim();
  const agent = $('useAgent').value.trim();
  if (id === '' || Number(id) < 0) return alert('Skill id required.');
  const c = CONTRACTS[currentChainId];
  const skR = contract();
  const skInfo = await skR.getSkill(id);
  const price = skInfo[2];
  if (!(await ensureWbot(price, 'useMsg'))) return;
  if (!(await ensureAllowance(c.sk, price))) return;
  const sk = new ethers.Contract(c.sk, SK_ABI, s);
  const tx = await sk.useSkill(id, /^0x[0-9a-fA-F]{40}$/.test(agent) ? agent : ethers.ZeroAddress, { gasPrice: ethers.parseUnits('20', 'gwei'), gasLimit: 600000n });
  await tx.wait();
  refresh();
}

async function doConfirm() {
  const s = await signerOrAlert();
  if (!s) return;
  const id = $('cfId').value.trim();
  if (id === '') return alert('Receipt id required.');
  const c = CONTRACTS[currentChainId];
  const sk = new ethers.Contract(c.sk, SK_ABI, s);
  const tx = await sk.confirmSuccess(id, { gasPrice: ethers.parseUnits('20', 'gwei'), gasLimit: 600000n });
  await tx.wait();
  refresh();
}

async function doDispute() {
  const s = await signerOrAlert();
  if (!s) return;
  const id = $('dsId').value.trim();
  if (id === '') return alert('Receipt id required.');
  const c = CONTRACTS[currentChainId];
  const sk = new ethers.Contract(c.sk, SK_ABI, s);
  const tx = await sk.disputeExecution(id, { gasPrice: ethers.parseUnits('20', 'gwei'), gasLimit: 600000n });
  await tx.wait();
  refresh();
}

async function ensureWbot(amount, msgId) {
  const s = await signerOrAlert();
  if (!s) return false;
  const c = CONTRACTS[currentChainId];
  const w = new ethers.Contract(c.wbot, ERC20_ABI, s);
  const owner = await s.getAddress();
  const bal = await w.balanceOf(owner);
  if (bal >= amount) return true;
  const shortfall = amount - bal;
  const native = await s.provider.getBalance(owner);
  const gasCost = ethers.parseUnits('0.005', 18);
  if (native < shortfall + gasCost) {
    showMsg(msgId, 'Need ' + fmt(shortfall + gasCost - native) + ' more BOT — fund the wallet first (wrap + gas).');
    return false;
  }
  showMsg(msgId, 'Wrapping BOT → WBOT…');
  const tx = await w.deposit({ value: shortfall });
  await tx.wait();
  return true;
}

function showMsg(id, msg) {
  const el = $(id);
  if (el) { el.textContent = msg; setTimeout(() => (el.textContent = ''), 6000); }
}

async function boot() {
  initAppKit();
  readProvider = new ethers.JsonRpcProvider(currentChainId === 677 ? 'https://rpc.botchain.ai' : 'https://rpc.bohr.life');
  if ($('pubBtn')) $('pubBtn').addEventListener('click', () => doPublish().catch((e) => showMsg('pubMsg', e.shortMessage || 'failed')));
  if ($('useBtn')) $('useBtn').addEventListener('click', () => doUse().catch((e) => showMsg('useMsg', e.shortMessage || 'failed')));
  if ($('cfBtn')) $('cfBtn').addEventListener('click', () => doConfirm().catch((e) => showMsg('cfMsg', e.shortMessage || 'failed')));
  if ($('dsBtn')) $('dsBtn').addEventListener('click', () => doDispute().catch((e) => showMsg('dsMsg', e.shortMessage || 'failed')));
  if ($('repBtn')) $('repBtn').addEventListener('click', () => renderRep(contract()).catch(() => {}));
  refresh();
}
boot();
