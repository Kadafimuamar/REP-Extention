# Reputation Ticker v3 — mint REP (di ReputationToken) dengan IMD

Letakkan isi zip ini di root project (menimpa `contracts/Reputation.sol` (isinya sama seperti versi awal), `contracts/ReputationToken.sol`, dan folder `extension/`).
File lama `scripts/deploy.js` dan `contracts/IMDToken.sol` sudah tidak dipakai (boleh dihapus).

    npm install
    npx hardhat test                      # 12 tes kontrak
    cp .env.example .env                  # isi DEPLOYER_PRIVATE_KEY

    # Uji coba (Sepolia, MockIMD otomatis ter-deploy)
    npx hardhat run scripts/deploy-reputation.js --network sepolia

    # Mainnet (IMD asli, uang asli)
    CONFIRM_MAINNET=yes npx hardhat run scripts/deploy-reputation.js --network mainnet

Salin 5 baris yang dicetak script ke `extension/config.js`, lalu reload extension.

Script men-deploy ReputationToken(IMD) lebih dulu, lalu Reputation(alamat REP).

Aturan mint (fungsi `mint(lots)` ada di ReputationToken.sol): 1 lot = 10.000 REP = 0,1 IMD. Setiap IMD yang terkumpul mencapai 1 IMD:
50% di-burn, 50% dikirim ke alamat deployer.
