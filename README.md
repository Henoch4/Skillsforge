# SkillForge — agent skills marketplace on BOT Chain

A marketplace for versioned agent skills on **BOT Chain mainnet (chain 677)**. Publishers list
MCP-style tools with a price per use; agent owners buy runs with funds **escrowed until the
execution is confirmed**; reputation (confirmed runs vs. dispute losses) is fully on-chain.

## Pages

| Page | What it does |
|---|---|
| `index.html` | Landing — live skills, receipts, volume stats |
| `app.html` | Publish, buy, confirm/dispute, reputation lookup |
| `docs.html` | Escrow model, contract API, demo activity, build & verify |

## On-chain (mainnet)

- **SkillMarket:** [`0x6374E48A1196Bdb5AD05F3C1Ca6C8042f84Db88E`](https://scan.botchain.ai/address/0x6374E48A1196Bdb5AD05F3C1Ca6C8042f84Db88E) — verified ✓
- **WBOT (payment token):** [`0xD5452816194a3784dBa983426cCe7c122F4abd30`](https://scan.botchain.ai/address/0xD5452816194a3784dBa983426cCe7c122F4abd30)
- Chain: `677` · RPC `https://rpc.botchain.ai` · explorer `https://scan.botchain.ai`
- Testnet twin (chain 968): `0x21809f45ad2Aac2eb24fd017cEBfecf4eE689149`

## Core API

```
publish(metadataURI, pricePerUse)         — list a skill
useSkill(skillId, agent)                  — escrow a paid run (2.5% fee on settlement)
confirmSuccess(receiptId)                 — buyer releases escrow to publisher
disputeExecution(receiptId) / resolveDispute(receiptId, publisherAtFault)
getSkill / getReceipt / successCount / failCount
```

Events: `SkillPublished`, `SkillUsed`, `ExecutionConfirmed`, `DisputeResolved` (full set in docs).

## Run locally

Static site — any file server works:

```bash
npx serve .
```

## Stack

- Vanilla HTML/CSS/JS (no build step)
- [ethers.js 6](https://docs.ethers.org/) via esm.sh
- [Reown AppKit](https://reown.com/appkit) for wallet connect
