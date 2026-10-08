const ZERO = "0x0000000000000000000000000000000000000000";
const $ = (id) => document.getElementById(id);

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const tokenAbi = [
  "function quote(uint256 lots) view returns (uint256 imdCost, uint256 repOut)",
  "function mint(uint256 lots)"
];

function mkProvider() {
  return new ethers.JsonRpcProvider(REP_CONFIG.rpcUrl, REP_CONFIG.chainId, {
    staticNetwork: ethers.Network.from(REP_CONFIG.chainId),
    cacheTimeout: -1 // tanpa cache: nonce harus selalu segar (approve lalu mint berurutan)
  });
}
async function getWallet() {
  const x = await chrome.storage.local.get(["rep_wallet"]);
  return x.rep_wallet;
}
async function saveWallet(w) {
  await chrome.storage.local.set({ rep_wallet: { privateKey: w.privateKey, address: w.address } });
}
const nf = (v, max = 4) => Number(v).toLocaleString(undefined, { maximumFractionDigits: max });

// ---------------------------------------------------------------- saldo
async function refresh() {
  $("keybox").hidden = true;
  $("keybox").textContent = "";
  $("export").textContent = "Show private key";
  $("netName").textContent = REP_CONFIG.networkName || "";
  $("netChain").textContent = "Chain ID " + REP_CONFIG.chainId;

  const w = await getWallet();
  if (!w) {
    $("address").textContent = "Not Created";
    $("balance").textContent = "\u2014";
    $("eth").textContent = "\u2014";
    $("imdBal").textContent = "\u2014";
    $("status").textContent = "Create or import a wallet first";
  } else {
    $("address").textContent = w.address;
  }

  const provider = mkProvider();
  if (w && REP_CONFIG.repToken !== ZERO) {
    try {
      const c = new ethers.Contract(REP_CONFIG.repToken, erc20Abi, provider);
      const [b, d, eth] = await Promise.all([c.balanceOf(w.address), c.decimals(), provider.getBalance(w.address)]);
      $("balance").textContent = nf(ethers.formatUnits(b, d)) + " REP";
      $("eth").textContent = ethers.formatEther(eth) + " ETH (for gas)";
      $("status").textContent = "Connected to " + (REP_CONFIG.networkName || "chain");
    } catch (e) {
      console.warn(e);
      $("status").textContent = "Failed to read the chain. Check rpcUrl / address in config.js";
    }
  } else if (w) {
    $("status").textContent = "Fill in the contract address in config.js (deploy output)";
  }
  await refreshMint(w, provider);
}

// ---------------------------------------------------------------- mint
const mintReady = () => REP_CONFIG.repToken !== ZERO && REP_CONFIG.imdToken !== ZERO;

async function refreshMint(w, provider) {
  $("mint").disabled = !mintReady();
  if (!mintReady()) {
    $("mintPrice").textContent = "Fill in IMD & repToken in config.js";
    return;
  }
  try {
    const rep = new ethers.Contract(REP_CONFIG.repToken, tokenAbi, provider);
    const imd = new ethers.Contract(REP_CONFIG.imdToken, erc20Abi, provider);
    const [q, dec, sym] = await Promise.all([rep.quote(1n), imd.decimals(), imd.symbol()]);
    $("mintPrice").textContent = `${nf(ethers.formatUnits(q[1], 18), 0)} REP = ${ethers.formatUnits(q[0], dec)} ${sym}`;
    if (w) {
      const bal = await imd.balanceOf(w.address);
      $("imdBal").textContent = `Saldo ${sym}: ${nf(ethers.formatUnits(bal, dec))}`;
    }
    await updateQuote();
  } catch (e) {
    console.warn(e);
    $("mintPrice").textContent = "Failed to read mint price. Check config.js";
  }
}

function parseLots() {
  const s = $("lots").value.trim();
  if (!/^\d+$/.test(s) || BigInt(s) === 0n) return null;
  return BigInt(s);
}

async function updateQuote() {
  const lots = parseLots();
  if (!lots || !mintReady()) { $("mintQuote").textContent = "\u00a0"; return; }
  try {
    const rep = new ethers.Contract(REP_CONFIG.repToken, tokenAbi, mkProvider());
    const imd = new ethers.Contract(REP_CONFIG.imdToken, erc20Abi, mkProvider());
    const [q, dec, sym] = await Promise.all([rep.quote(lots), imd.decimals(), imd.symbol()]);
    $("mintQuote").textContent = `Bayar ${ethers.formatUnits(q[0], dec)} ${sym} \u2192 ${nf(ethers.formatUnits(q[1], 18), 0)} REP`;
  } catch (e) {
    $("mintQuote").textContent = "\u00a0";
  }
}

function setMintMsg(text, cls) {
  const el = $("mintMsg");
  el.className = "muted" + (cls ? " " + cls : "");
  el.textContent = text;
  return el;
}

async function doMint() {
  const w = await getWallet();
  if (!w) return setMintMsg("Create or import a wallet first", "err");
  const lots = parseLots();
  if (!lots) return setMintMsg("The number of lots must be a positive integer", "err");

  $("mint").disabled = true;
  try {
    const signer = new ethers.Wallet(w.privateKey, mkProvider());
    const rep = new ethers.Contract(REP_CONFIG.repToken, tokenAbi, signer);
    const imd = new ethers.Contract(REP_CONFIG.imdToken, erc20Abi, signer);
    const [dec, sym] = await Promise.all([imd.decimals(), imd.symbol()]);
    const [cost, repOut] = await rep.quote(lots);

    const bal = await imd.balanceOf(w.address);
    if (bal < cost) {
      throw new Error(`Balance ${sym} is insufficient (need ${ethers.formatUnits(cost, dec)}, have ${ethers.formatUnits(bal, dec)})`);
    }
    const allowance = await imd.allowance(w.address, REP_CONFIG.repToken);
    if (allowance < cost) {
      setMintMsg(`1/2 \u00b7 Approve ${sym}...`);
      await (await imd.approve(REP_CONFIG.repToken, cost)).wait();
    }
    setMintMsg("2/2 \u00b7 Mint REP...");
    const tx = await rep.mint(lots);
    setMintMsg("Waiting for confirmation...");
    await tx.wait();

    const el = setMintMsg(`\u2713 Mint ${nf(ethers.formatUnits(repOut, 18), 0)} REP successful. `, "ok");
    const a = document.createElement("a");
    a.href = REP_CONFIG.explorer + "/tx/" + tx.hash;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "See transaction";
    el.appendChild(a);
    await refresh();
  } catch (e) {
    console.warn(e);
    setMintMsg(e.shortMessage || e.message || "Mint failed", "err");
  } finally {
    $("mint").disabled = !mintReady();
  }
}

document.querySelectorAll(".chip").forEach((b) => {
  b.onclick = () => { $("lots").value = b.dataset.lots; updateQuote(); };
});
$("lots").addEventListener("input", updateQuote);
$("mint").onclick = doMint;

// ---------------------------------------------------------------- wallet
$("create").onclick = async () => {
  const existing = await getWallet();
  if (existing) {
    const ok = confirm(
      "Wallet already exists (" + existing.address + ").\n\n" +
      "Creating a new wallet will OVERWRITE the old private key. Make sure you have a backup. Continue?"
    );
    if (!ok) return;
  }
  await saveWallet(ethers.Wallet.createRandom());
  await refresh();
};

$("copy").onclick = async () => {
  const w = await getWallet();
  if (!w) return;
  await navigator.clipboard.writeText(w.address);
  $("status").textContent = "Address copied";
};

$("export").onclick = async () => {
  const box = $("keybox");
  if (!box.hidden) {
    box.hidden = true;
    box.textContent = "";
    $("export").textContent = "Display private key";
    return;
  }
  const w = await getWallet();
  if (!w) return;
  box.textContent = w.privateKey;
  box.hidden = false;
  $("export").textContent = "Hide private key";
};

$("import").onclick = async () => {
  const raw = $("importKey").value.trim();
  if (!raw) return;
  let w;
  try {
    w = new ethers.Wallet(raw.startsWith("0x") ? raw : "0x" + raw);
  } catch (e) {
    $("status").textContent = "Private key is invalid";
    return;
  }
  const existing = await getWallet();
  if (existing && existing.address !== w.address) {
    const ok = confirm("This will OVERWRITE the current wallet (" + existing.address + "). Continue?");
    if (!ok) return;
  }
  await saveWallet(w);
  $("importKey").value = "";
  await refresh();
};

$("refresh").onclick = refresh;
refresh();
