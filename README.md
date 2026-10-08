# Installing Reputation Ticker ($REP)

Reputation Ticker is a Chrome extension (Manifest V3) that adds an on-chain reputation card to X (Twitter) profiles. You can mint REP with IMD from the extension popup and give REP to any X account.

It works in Chromium-based browsers: **Google Chrome, Microsoft Edge, Brave, Opera, Arc**. Firefox and Safari are not supported.

> ⚠️ The extension stores its wallet private key **unencrypted** in your browser. Use a dedicated wallet and only fund it with small amount. On mainnet, every mint and every gas fee uses real money.

---

## 1. Get the code

**Option A: download a ZIP (no Git needed)**

1. Open the repository on GitHub: `[https://github.com/<your-username>/<your-repo>](https://github.com/Kadafimuamar/REP-Extention)`
2. Click the green **Code** button, then **Download ZIP**.
3. Unzip it anywhere you will keep it (do not delete the folder afterwards, Chrome loads the extension from it).

**Option B: clone with Git**

```bash
git clone https://github.com/Kadafimuamar/REP-Extention.git
```

You should now have a folder that contains an `extension/` directory. The file `extension/manifest.json` must exist.

---

## 2. Load the extension in Chrome

1. Open `chrome://extensions` in the address bar (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the **`extension`** folder, the one that directly contains `manifest.json` (not the repository root).
5. *Reputation Ticker — $REP* now appears in your extensions list.
6. Click the puzzle-piece icon in the toolbar and **pin** the extension so the popup is one click away.

---

## 3. First-time setup

1. Click the extension icon to open the popup.
2. Click **Create new wallet** (create wallet). Do this **once**: creating a new wallet overwrites the old one.
3. Click **show private key**  and **back it up somewhere safe**. There is no recovery without it. You can restore a wallet later with **Import wallet**.
4. Copy the wallet address (**Copy address**) and fund it:
   - **ETH** on the selected network, for gas.
   - **IMD** on the selected network, to mint REP.
5. Press **Refresh** in the popup. Your REP, IMD and ETH balances should appear.

---

## 5. Use it

**Mint REP**

1. In the popup, open the **Mint REP** card.
2. Choose the number of lots (1 lot = 10,000 REP = 0.1 IMD) or type your own amount.
3. Click **Mint REP**. The extension sends an approval transaction (if needed), then the mint transaction.

**Give REP on X**

1. Open any profile on `https://x.com/<username>`.
2. The **Reputation** card appears below the follower counts.
3. Click **Give REP** (**Beri REP** if X is set to Indonesian), choose an amount and a category, then confirm.
4. After the transaction is confirmed, the card shows the updated score and number of givers.

---

## 6. Updating

```bash
git pull
```

(or download the ZIP again and replace the folder), then open `chrome://extensions` and click the **reload** icon on the extension. Your wallet is kept in the browser storage and is not lost when you reload or update. If you remove the extension, the wallet is deleted, so make sure you have backed up the private key.

---

