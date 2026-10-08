// =====================================================================
//  Reputation Ticker — content script (cardprofil X + dialog Give REP)
// =====================================================================

// ---------- Provider  worker (CORS x.com) ----------
class BgProvider extends ethers.JsonRpcProvider {
  constructor() {
    super(REP_CONFIG.rpcUrl, REP_CONFIG.chainId, {
      staticNetwork: ethers.Network.from(REP_CONFIG.chainId),
      cacheTimeout: -1 
    });
  }
  async _send(payload) {
    const res = await chrome.runtime.sendMessage({
      type: "rpc",
      url: REP_CONFIG.rpcUrl,
      payload
    });
    if (!res || res.error) throw new Error((res && res.error) || "RPC failed");
    return Array.isArray(res.result) ? res.result : [res.result];
  }
}

const ZERO = "0x0000000000000000000000000000000000000000";
const REP_ABI = [
  "function reputationOf(bytes32) view returns (uint256,uint256)",
  "function giveReputation(bytes32,uint256,uint8)"
];
const ERC20_ABI = [
  "function approve(address,uint256) returns(bool)",
  "function allowance(address,address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)"
];

// ---------- Teks (otomatis Indonesia bila bahasa X = id) ----------
const I18N = {
  en: {
    title: "Reputation", givers: (n) => `${n} ${n === 1 ? "giver" : "givers"}`, give: "Give REP",
    loading: "Loading…", loadFail: "Couldn't read the chain", retry: "Retry",
    modalTitle: "Give reputation", amount: "Amount", category: "Category", balance: "Balance", gas: "ETH for Gas",
    noGas: "No ETH for gas. Get some from a faucet.",
    noWallet: "No wallet yet. Create one from the extension popup.",
    confirm: (a) => `Give ${a} REP`, preparing: "Preparing…",
    approving: "Step 1/2 · Approving REP…", sending: "Step 2/2 · Sending reputation…",
    waiting: "Waiting for confirmation…", done: "Reputation recorded", viewTx: "View on Etherscan",
    close: "Close", badAmount: "Enter an amount greater than 0", noBalance: "Not enough REP. Mint more from the extension popup.",
    cats: ["Trust", "Knowledge", "Builder", "Research", "Community", "Creator"]
  },
  id: {
    title: "Reputasi", givers: (n) => `${n} pemberi`, give: "Beri REP",
    loading: "Memuat…", loadFail: "Gagal membaca chain", retry: "Coba lagi",
    modalTitle: "Beri reputasi", amount: "Jumlah", category: "Kategori", balance: "Saldo", gas: "ETH untuk gas",
    noGas: "Tidak ada ETH untuk gas. Ambil dari faucet.",
    noWallet: "Belum ada wallet. Buat dulu dari popup extension.",
    confirm: (a) => `Beri ${a} REP`, preparing: "Menyiapkan…",
    approving: "Langkah 1/2 · Menyetujui REP…", sending: "Langkah 2/2 · Mengirim reputasi…",
    waiting: "Menunggu konfirmasi…", done: "Reputasi tercatat", viewTx: "Lihat di Etherscan",
    close: "Tutup", badAmount: "Masukkan jumlah lebih dari 0", noBalance: "Saldo REP tidak cukup. Mint dulu dari popup extension.",
    cats: ["Kepercayaan", "Pengetahuan", "Builder", "Riset", "Komunitas", "Kreator"]
  }
};
function T() {
  return (document.documentElement.lang || "").toLowerCase().startsWith("id") ? I18N.id : I18N.en;
}

// ---------- Ikon ----------
const ICON_TREND = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>`;

// ---------- Tema X: dark (Lights out) / dim / light ----------
function detectTheme() {
  const m = (getComputedStyle(document.body).backgroundColor || "").match(/\d+/g);
  const [r, g, b] = m ? m.map(Number) : [0, 0, 0];
  if (0.299 * r + 0.587 * g + 0.114 * b > 128) return "light";
  return r + g + b < 24 ? "dark" : "dim";
}

// ---------- Util ----------
const BLOCKED = ["home","explore","notifications","messages","search","settings","i","compose","login","intent","share","tos","privacy","hashtag","jobs","lists","bookmarks","premium","grok","communities","account","download"];
// hanya halaman profil: /user, /user/with_replies, /user/media, dst.
const PROFILE_RE = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|articles|likes|superfollows))?\/?$/;

function usernameFromUrl() {
  const m = location.pathname.match(PROFILE_RE);
  if (!m) return null;
  return BLOCKED.includes(m[1].toLowerCase()) ? null : m[1];
}
function keyForUser(username) {
  return ethers.keccak256(ethers.toUtf8Bytes("x:" + username.toLowerCase()));
}
async function wallet() {
  const x = await chrome.storage.local.get(["rep_wallet"]);
  if (!x.rep_wallet) throw new Error(T().noWallet);
  return new ethers.Wallet(x.rep_wallet.privateKey, new BgProvider());
}
function fmt(v) {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  if (n >= 10000) return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 });
}

// =====================================================================
//  Kartu di profil
// =====================================================================
const state = { user: null, status: "loading", score: 0, givers: 0, token: 0 };
let misses = 0;
const MISS_LIMIT = 6; // ±9 detik tanpa menemukan header profil -> kartu melayang

function buildCard() {
  const el = document.createElement("div");
  el.id = "rep-ticker-card";
  el.className = "rep-card";
  el.innerHTML = `<div class="rep-badge">${ICON_TREND}</div>
    <div class="rep-main">
      <div class="rep-label"><span class="rep-title"></span><span class="rep-net"></span></div>
      <div class="rep-score"><span class="rep-num"></span><small>REP</small></div>
      <div class="rep-sub"></div>
    </div>
    <button type="button" class="rep-btn"></button>`;
  el.querySelector(".rep-net").textContent = REP_CONFIG.networkName || "";
  el.querySelector(".rep-btn").onclick = () => { if (state.user) openModal(state.user); };
  return el;
}

function renderCard() {
  const el = document.getElementById("rep-ticker-card");
  if (!el) return;
  const L = T();
  const theme = detectTheme();
  el.setAttribute("data-rep-theme", theme);
  const sig = [state.status, state.score, state.givers, L.title, theme].join("|");
  if (el._sig === sig) return; // tidak ada yang berubah
  el._sig = sig;

  el.querySelector(".rep-title").textContent = L.title;
  el.querySelector(".rep-btn").textContent = L.give;
  const num = el.querySelector(".rep-num");
  const sub = el.querySelector(".rep-sub");
  sub.textContent = "";
  if (state.status === "loading") {
    num.innerHTML = '<span class="rep-skel"></span>';
    sub.textContent = L.loading;
  } else if (state.status === "error") {
    num.textContent = "—";
    sub.append(L.loadFail + " · ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "rep-link";
    retry.textContent = L.retry;
    retry.onclick = () => load(state.user);
    sub.appendChild(retry);
  } else {
    num.textContent = fmt(state.score);
    sub.textContent = L.givers(state.givers);
  }
}

// Letakkan kartu di bawah baris Mengikuti/Pengikut pada header profil
function placeCard(el) {
  const items = document.querySelector('[data-testid="UserProfileHeader_Items"]');
  let after = null;
  if (items) {
    const parent = items.parentElement;
    const fl = parent && parent.querySelector('a[href$="/following"],a[href$="/verified_followers"],a[href$="/followers"]');
    let n = fl;
    while (n && n.parentElement !== parent) n = n.parentElement;
    after = n || items;
  } else {
    after = document.querySelector('[data-testid="UserDescription"]') || document.querySelector('[data-testid="UserName"]');
  }
  if (!after) return false;
  el.classList.remove("rep-floating");
  if (after.nextElementSibling !== el) after.after(el);
  return true;
}

// Sejajarkan tepi kiri/kanan kartu dengan teks nama di profil (padding profil X)
function alignCard(el) {
  const col = document.querySelector('[data-testid="primaryColumn"]');
  const ref = document.querySelector('[data-testid="UserName"]');
  if (!col || !ref || el.classList.contains("rep-floating")) return;
  el.style.marginLeft = "0px";
  el.style.marginRight = "0px";
  const cr = col.getBoundingClientRect();
  const rr = ref.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (!cr.width || !er.width) return;
  const pad = Math.max(0, Math.round(rr.left - cr.left));
  el.style.marginLeft = Math.max(0, pad - Math.round(er.left - cr.left)) + "px";
  el.style.marginRight = Math.max(0, pad - Math.round(cr.right - er.right)) + "px";
}

function floatCard(el) {
  el.classList.add("rep-floating");
  el.style.marginLeft = el.style.marginRight = "";
  if (el.parentElement !== document.body) document.body.appendChild(el);
}

async function load(user, silent) {
  const tok = ++state.token;
  state.user = user;
  if (!silent) { state.status = "loading"; renderCard(); }
  try {
    if (REP_CONFIG.reputationContract === ZERO) {
      state.score = 0; state.givers = 0; state.status = "ok";
    } else {
      const c = new ethers.Contract(REP_CONFIG.reputationContract, REP_ABI, new BgProvider());
      const r = await c.reputationOf(keyForUser(user));
      if (tok !== state.token) return;
      state.score = Number(ethers.formatUnits(r[0], 18));
      state.givers = Number(r[1]);
      state.status = "ok";
    }
  } catch (e) {
    if (tok !== state.token) return;
    console.warn("[REP] gagal membaca reputasi:", e);
    if (!silent) state.status = "error";
  }
  renderCard();
}

function tick() {
  const user = usernameFromUrl();
  const existing = document.getElementById("rep-ticker-card");
  if (!user) {
    if (existing) existing.remove();
    state.user = null;
    misses = 0;
    return;
  }
  const el = existing || buildCard();
  if (placeCard(el)) { misses = 0; alignCard(el); }
  else if (++misses >= MISS_LIMIT) floatCard(el);
  else return; // header profil belum dirender, coba lagi pada tick berikutnya

  if (user !== state.user) load(user);
  else renderCard();
}

// =====================================================================
//  Dialog Give REP
// =====================================================================
let modalCleanup = null;
function closeModal() {
  const o = document.getElementById("rep-modal-overlay");
  if (o) o.remove();
  if (modalCleanup) { modalCleanup(); modalCleanup = null; }
}

function profileAvatarSrc(username) {
  const c = document.querySelector(`[data-testid="UserAvatar-Container-${username}" i] img`);
  return c && c.src ? c.src : null;
}

function openModal(username) {
  closeModal();
  const L = T();
  const o = document.createElement("div");
  o.id = "rep-modal-overlay";
  o.className = "rep-overlay";
  o.setAttribute("data-rep-theme", detectTheme());
  o.innerHTML = `<div class="rep-dialog" role="dialog" aria-modal="true">
    <div class="rep-dh"><button type="button" class="rep-x">${ICON_CLOSE}</button><div class="rep-dtitle"></div></div>
    <div class="rep-dbody">
      <div class="rep-target"><div class="rep-ava"></div><div><div class="rep-tname"></div><div class="rep-tsub"></div></div></div>
      <label class="rep-field-label rep-lbl-amount"></label>
      <div class="rep-amtwrap"><input class="rep-amt" type="number" min="0" step="any" inputmode="decimal" value="10"><span class="rep-unit">REP</span></div>
      <div class="rep-chips rep-quick"></div>
      <label class="rep-field-label rep-lbl-cat"></label>
      <div class="rep-chips rep-cats"></div>
      <div class="rep-info"></div>
      <button type="button" class="rep-btn rep-confirm"></button>
      <div class="rep-msg" aria-live="polite"></div>
    </div>
  </div>`;
  document.body.appendChild(o);

  const q = (s) => o.querySelector(s);
  q(".rep-x").setAttribute("aria-label", L.close);
  q(".rep-dtitle").textContent = L.modalTitle;
  q(".rep-tname").textContent = "@" + username;
  q(".rep-tsub").textContent = REP_CONFIG.networkName || "";
  q(".rep-lbl-amount").textContent = L.amount;
  q(".rep-lbl-cat").textContent = L.category;

  const src = profileAvatarSrc(username);
  if (src) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = src;
    q(".rep-ava").appendChild(img);
  } else {
    q(".rep-ava").innerHTML = ICON_TREND;
  }

  const input = q(".rep-amt");
  const confirmBtn = q(".rep-confirm");
  const updateLabel = () => { confirmBtn.textContent = L.confirm(input.value || "0"); };
  input.addEventListener("input", updateLabel);
  updateLabel();

  [10, 50, 100, 500].forEach((n) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rep-chip"; b.textContent = String(n);
    b.onclick = () => { input.value = String(n); updateLabel(); };
    q(".rep-quick").appendChild(b);
  });
  L.cats.forEach((name, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rep-chip" + (i === 0 ? " rep-on" : "");
    b.dataset.cat = String(i); b.textContent = name;
    b.onclick = () => {
      q(".rep-cats").querySelectorAll(".rep-chip").forEach((x) => x.classList.remove("rep-on"));
      b.classList.add("rep-on");
    };
    q(".rep-cats").appendChild(b);
  });

  // tutup: tombol X, klik di luar dialog, tombol Esc
  q(".rep-x").onclick = closeModal;
  o.addEventListener("mousedown", (e) => { if (e.target === o) closeModal(); });
  const onKey = (e) => { if (e.key === "Escape") closeModal(); };
  document.addEventListener("keydown", onKey, true);
  modalCleanup = () => document.removeEventListener("keydown", onKey, true);

  confirmBtn.onclick = () => give(username, o);

  // info saldo REP + ETH (gas)
  (async () => {
    const info = q(".rep-info");
    try {
      const x = await chrome.storage.local.get(["rep_wallet"]);
      if (!x.rep_wallet) { info.textContent = L.noWallet; info.classList.add("rep-warn"); return; }
      const p = new BgProvider();
      const token = new ethers.Contract(REP_CONFIG.repToken, ERC20_ABI, p);
      const [b, d, eth] = await Promise.all([
        token.balanceOf(x.rep_wallet.address),
        token.decimals(),
        p.getBalance(x.rep_wallet.address)
      ]);
      if (!o.isConnected) return;
      info.textContent = `${L.balance}: ${fmt(ethers.formatUnits(b, d))} REP · ${L.gas}: ${Number(ethers.formatEther(eth)).toFixed(4)} ETH`;
      if (eth === 0n) { info.textContent += "\n" + L.noGas; info.style.whiteSpace = "pre-line"; info.classList.add("rep-warn"); }
    } catch (e) { /* info saldo opsional */ }
  })();

  input.focus();
  input.select();
}

async function give(username, o) {
  const L = T();
  const msg = o.querySelector(".rep-msg");
  const btn = o.querySelector(".rep-confirm");
  const setMsg = (text, cls) => { msg.className = "rep-msg" + (cls ? " " + cls : ""); msg.textContent = text; };
  btn.disabled = true;
  setMsg(L.preparing);
  try {
    const w = await wallet();
    const token = new ethers.Contract(REP_CONFIG.repToken, ERC20_ABI, w);
    const rep = new ethers.Contract(REP_CONFIG.reputationContract, REP_ABI, w);
    const d = await token.decimals();
    const amount = ethers.parseUnits(o.querySelector(".rep-amt").value || "0", d);
    if (amount <= 0n) throw new Error(L.badAmount);
    const cat = Number(o.querySelector(".rep-cats .rep-on").dataset.cat);

    const bal = await token.balanceOf(w.address);
    if (bal < amount) throw new Error(L.noBalance);

    const allowance = await token.allowance(w.address, REP_CONFIG.reputationContract);
    if (allowance < amount) {
      setMsg(L.approving);
      const a = await token.approve(REP_CONFIG.reputationContract, amount);
      await a.wait();
    }

    setMsg(L.sending);
    const tx = await rep.giveReputation(keyForUser(username), amount, cat);
    setMsg(L.waiting);
    await tx.wait();

    setMsg("✓ " + L.done + " · ", "rep-ok");
    const link = document.createElement("a");
    link.href = REP_CONFIG.explorer + "/tx/" + tx.hash;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = L.viewTx;
    msg.appendChild(link);
    if (state.user === username) load(username, true);
  } catch (e) {
    setMsg(e.shortMessage || e.message || "Transaction failed", "rep-err");
  } finally {
    btn.disabled = false;
  }
}

setInterval(tick, 1500);
tick();
