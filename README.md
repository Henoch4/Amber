# Amber — Liquid staking on BOT Chain

Stake BOT, receive stBOT 1:1, keep earning 5% APY while staying liquid.
Unstake with a transparent 2-day cooldown — request, wait, claim.

## Networks
- Testnet — chainId 968 — RPC https://rpc.bohr.life — explorer https://scan.bohr.life
- Mainnet — chainId 677 — RPC https://rpc.botchain.ai — explorer https://scan.botchain.ai

## Deployments
- Mainnet (677): pending — contract compiled (solc 0.8.30, OpenZeppelin 5.6.1, optimized), deploy queued.
- Constructor: WBOT `0xD5452816194a3784dBa983426cCe7c122F4abd30`. The contract deploys its own stBOT token (`Staked BOT` / `stBOT`) at construction.

## Structure
- `frontend/` — static dApp (index.html + app.js). Wallet connect via Reown/AppKit, chain switch to mainnet 677.
- `contracts/Amber.sol` — stake / request unstake / claim after 2 days / claim rewards. Rewards accrue per-second at 5% APY; stBOT minted on stake and burned on unstake request.

## Run frontend
Serve the folder over HTTP (ES modules don't load from `file://`):
```
npx serve frontend
```

## Team Safe (2-of-2, all projects)
- Safe: `0x3f6599D5694044Ac0B357695843391220a5aE0c3` — owners `0x79d0…9188` + `0x7765…5D82`, threshold 2.
