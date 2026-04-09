<p align="center">
  <img src="https://img.shields.io/badge/CLPAY-Autonomous_AI_Payments-E63946?style=for-the-badge&labelColor=0a0a0f" alt="CLPAY" />
</p>

<h1 align="center">CLPAY</h1>
<p align="center">
  <strong>Autonomous payments for Claude using Solana</strong><br>
  Secured by pre-execution validation and real-time risk analysis
</p>

<p align="center">
  <img src="https://img.shields.io/badge/solana-devnet%20%7C%20mainnet-E63946?style=flat-square&labelColor=12121a" alt="Solana" />
  <img src="https://img.shields.io/badge/node-18%2B-E63946?style=flat-square&labelColor=12121a" alt="Node" />
  <img src="https://img.shields.io/badge/MCP-compatible-E63946?style=flat-square&labelColor=12121a" alt="MCP" />
  <img src="https://img.shields.io/badge/license-MIT-E63946?style=flat-square&labelColor=12121a" alt="License" />
</p>

---

## What is CLPAY?

CLPAY is a skill that gives AI agents (Claude, Kiro, etc.) the ability to **independently pay** for resources — subscriptions, APIs, services — through a **Solana wallet**.

Every payment goes through a **validator agent** that acts as an independent gatekeeper. No transaction executes without passing all checks.

```
Claude: "I need GPT-4 API access for comparison analysis"

  ⟡ CLPAY  Initiating payment validation...
  ✓ Simulating transaction: 0.02 SOL → OpenAI merchant
  ✓ Contract verified — no malicious patterns
  ✓ Risk score: 0.12 / 1.00 — LOW
  ✓ Necessity: HIGH — required for current task
  ◈ APPROVED  tx: 5Kj9...mR2x
```

---

## Quick Start (MCP — recommended)

The fastest way to use CLPAY is as an MCP server. This lets Claude / Kiro call payment tools directly from chat.

### 1. Install

```bash
cd clpay
npm install
```

### 2. Create a Devnet Wallet

```bash
node generate-wallet.js
```

This creates a keypair at `keys/dev-wallet.json` and airdrops 2 SOL from devnet. No Solana CLI needed.

If the airdrop fails (rate limit), go to https://faucet.solana.com and paste your pubkey.

### 3. Connect to Kiro / Claude

Copy `mcp.example.json` into your MCP config:

**Kiro:** `.kiro/settings/mcp.json`
**Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "clpay": {
      "command": "node",
      "args": ["mcp-server.js"],
      "cwd": "/FULL/PATH/TO/clpay",
      "env": {
        "CLPAY_WALLET": "./keys/dev-wallet.json",
        "CLPAY_NETWORK": "devnet",
        "CLPAY_RISK_THRESHOLD": "0.5",
        "CLPAY_PER_TX_LIMIT": "0.1",
        "CLPAY_DAILY_LIMIT": "1.0",
        "CLPAY_ALLOWLIST": ""
      }
    }
  }
}
```

Replace `/FULL/PATH/TO/clpay` with the actual path to the clpay folder.

### 4. Use It

Once connected, the AI agent has access to these tools:

| Tool | What it does |
|------|-------------|
| `clpay_pay` | Make a payment through the full validation pipeline |
| `clpay_simulate` | Dry-run a transaction without sending SOL |
| `clpay_balance` | Check wallet balance and daily spending |
| `clpay_history` | View recent transactions with status and reasoning |

The agent can now say things like:
> "I need to pay 0.02 SOL for API access to complete this task"

And CLPAY will simulate, validate, risk-check, and either approve or reject — all automatically.

---

## MCP Tools Reference

### `clpay_pay`

Make a payment through the full validation pipeline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `to` | string | Recipient Solana address |
| `amount` | number | Amount in SOL |
| `reason` | string | Why this payment is needed |
| `taskContext` | string | Current task description |

Returns status, tx hash (if approved), risk score, necessity level, or rejection reason.

### `clpay_simulate`

Simulate a payment without executing it.

| Parameter | Type | Description |
|-----------|------|-------------|
| `to` | string | Recipient address |
| `amount` | number | Amount in SOL |
| `reason` | string | Payment reason |

Returns whether the transaction would succeed, balance change, compute units.

### `clpay_balance`

No parameters. Returns current SOL balance, daily spent/remaining, limits, network.

### `clpay_history`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Number of recent transactions |
| `status` | string | `'all'` | Filter: `'all'`, `'approved'`, `'rejected'` |

---

## Mainnet Usage

CLPAY works on mainnet — same code, just different config:

```json
{
  "CLPAY_NETWORK": "mainnet-beta",
  "CLPAY_WALLET": "./keys/mainnet-wallet.json",
  "CLPAY_RISK_THRESHOLD": "0.3",
  "CLPAY_PER_TX_LIMIT": "0.05",
  "CLPAY_DAILY_LIMIT": "0.5"
}
```

For mainnet you need a wallet with real SOL. Export a keypair from Phantom, Solflare, or generate one with `solana-keygen`. The `generate-wallet.js` script is devnet-only (free airdrop).

We recommend lower limits and a stricter risk threshold for mainnet. Start small, monitor the audit log, adjust as needed.

---

## Environment Variables

All config is via env vars (set in the MCP config or shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `CLPAY_WALLET` | `./keys/dev-wallet.json` | Path to wallet keypair |
| `CLPAY_NETWORK` | `devnet` | `devnet`, `testnet`, `mainnet-beta` |
| `CLPAY_RISK_THRESHOLD` | `0.5` | Max risk score (0–1) |
| `CLPAY_PER_TX_LIMIT` | `0.1` | Max SOL per transaction |
| `CLPAY_DAILY_LIMIT` | `1.0` | Max SOL per 24h |
| `CLPAY_ALLOWLIST` | `` | Comma-separated trusted addresses |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              AI Agent (Claude / Kiro)                │
│                                                     │
│  "I need to pay for X to complete this task"        │
└──────────────────────┬──────────────────────────────┘
                       │ MCP tool call
                       ▼
┌─────────────────────────────────────────────────────┐
│               MCP Server (mcp-server.js)            │
│                                                     │
│  clpay_pay · clpay_simulate · clpay_balance · ...   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                    CLPay Core                        │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Wallet     │  │  Risk Engine │  │  Audit Log │ │
│  │  (isolated)  │  │  (6 signals) │  │  (full tx) │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┘ │
│         │                │                          │
│         ▼                ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │            Validator Agent (side-agent)       │   │
│  │                                              │   │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────┐ │   │
│  │  │ Simulation │→ │ Security │→ │Necessity │ │   │
│  │  │   Stage    │  │  Stage   │  │  Stage   │ │   │
│  │  └────────────┘  └──────────┘  └──────────┘ │   │
│  │         │              │             │       │   │
│  │         ▼              ▼             ▼       │   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │           Limit Stage (hard cap)        │ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  │                     │                        │   │
│  │            ┌────────┴────────┐               │   │
│  │            ▼                 ▼               │   │
│  │      ◈ APPROVED        ◈ REJECTED           │   │
│  │      (sign & send)     (block + explain)     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Solana Network  │
              │  (devnet/main)   │
              └─────────────────┘
```

---

## Validation Pipeline

Every payment passes through 4 stages in order. If any stage fails, the payment is blocked.

**Stage 1: Simulation** — Dry-run on Solana. Captures success/failure, state changes, compute units.

**Stage 2: Security** — Checks recipient against allowlist/blocklist. Produces a composite risk score from 6 weighted signals.

**Stage 3: Necessity** — Evaluates `reason` and `taskContext` to determine if the purchase is essential, helpful, or unnecessary.

**Stage 4: Limits** — Hard enforcement of per-tx and daily caps. Cannot be bypassed by the AI.

---

## Risk Engine

Composite score from 6 signals:

| Signal | Weight | What it checks |
|--------|--------|----------------|
| Recipient reputation | 25% | Allowlisted vs unknown vs blocklisted |
| Contract verification | 20% | Verified source, audit status |
| Transaction pattern | 15% | Unusual amounts, rapid-fire txs |
| Simulation result | 20% | Unexpected failures or state changes |
| Historical behavior | 10% | Past interactions with this recipient |
| Network conditions | 10% | Congestion, fee anomalies |

- `0.0 – 0.3` → LOW risk
- `0.3 – 0.6` → MEDIUM risk
- `0.6 – 1.0` → HIGH risk (auto-blocked if above threshold)

---

## Testing

Run the test suite (no wallet or blockchain needed — everything is mocked):

```bash
node test.js
```

```
  ◈ CLPAY — Test Suite
  ──────────────────────────────────────────────────

  Risk Engine
  ✓ allowlisted recipient → score 0
  ✓ blocklisted recipient → score 1.0 + flag
  ✓ unknown recipient → moderate risk + flag
  ✓ large amount → LARGE_AMOUNT flag
  ✓ failed simulation → high risk
  ✓ no simulation data → NO_SIMULATION flag
  ✓ first interaction → FIRST_INTERACTION flag
  ✓ recordTransaction tracks history

  Validator Agent — Full Pipeline
  ✓ all stages pass → approved
  ✓ simulation fails → rejected at simulation stage
  ✓ blocklisted recipient → rejected at security stage
  ✓ exceeds daily limit → rejected at limits stage
  ✓ stages run in correct order
  ✓ disabled stages are skipped

  Custom Validation Stage
  ✓ custom stage can reject
  ✓ custom stage can pass and add context

  Necessity Evaluation
  ✓ high necessity keywords → passes
  ✓ low necessity keywords → still passes (not none)
  ✓ mixed keywords → medium necessity

  ──────────────────────────────────────────────────
  19/19 passed
```

---

## Custom Validation Stages

Add your own logic to the pipeline:

```javascript
import { ValidationStage } from './skill/validator.js';

class HumanApprovalStage extends ValidationStage {
  name = 'human-approval';

  async validate(tx) {
    if (tx.amount > 0.05) {
      const approved = await askHuman(`Approve ${tx.amount} SOL to ${tx.to}?`);
      if (!approved) {
        return { pass: false, reason: 'Human rejected', code: 'HUMAN_REJECTED' };
      }
    }
    return { pass: true };
  }
}
```

---

## Security Model

| Threat | Protection |
|--------|-----------|
| Prompt injection → unauthorized payment | Independent validator agent |
| Malicious recipient | Blocklist + security stage + risk scoring |
| Excessive spending | Hard limits at wallet level (not overridable) |
| Transaction manipulation | Simulation detects unexpected state changes |
| Key theft | Isolated module with `#private` fields, memory zeroing |

---

## Project Structure

```
clpay/
├── mcp-server.js          # MCP server — connects AI agents to CLPAY
├── mcp.example.json       # Example MCP config for Kiro / Claude
├── generate-wallet.js     # Creates devnet wallet + airdrops SOL
├── skill/
│   ├── clpay.js           # Core module — orchestrates everything
│   ├── config.js          # Configuration with validation
│   ├── wallet.js          # Solana wallet (isolated key management)
│   ├── validator.js       # Validator agent (4-stage pipeline)
│   └── risk.js            # Risk engine (6-signal scoring)
├── test.js                # Test suite (19 tests, no blockchain needed)
├── demo.js                # Interactive demo with colored output
├── index.html             # Landing page
├── docs.html              # Full documentation
├── style.css              # Styles
├── script.js              # Landing page interactions + particle bg
├── package.json           # Dependencies & scripts
└── README.md              # You are here
```

---

## Programmatic Usage (without MCP)

```javascript
import { CLPay } from './skill/clpay.js';

const clpay = new CLPay({
  network: 'devnet',
  wallet: './keys/dev-wallet.json',
  limits: { perTransaction: 0.1, daily: 1.0 },
  riskThreshold: 0.5,
  allowlist: ['merchant-address'],
});

const result = await clpay.pay({
  to: 'merchant-address',
  amount: 0.02,
  reason: 'API access for data analysis',
  taskContext: 'User requested multi-model benchmark',
});

// Events
clpay.on('payment:approved', (tx, validation) => { });
clpay.on('payment:rejected', (tx, rejection) => { });
clpay.on('payment:executed', (tx, signature) => { });
clpay.on('limit:warning', (usage) => { });
```

---

## Roadmap

- [ ] SPL token support (USDC, USDT)
- [ ] LLM-based necessity evaluation (replace keyword heuristic)
- [ ] On-chain program verification via Solana Explorer API
- [ ] Scam address database integration
- [ ] Multi-sig support for high-value transactions
- [ ] Dashboard UI for monitoring payments
- [ ] Hardware wallet (Ledger) support

---

## License

MIT

---

<p align="center">
  <strong>CLPAY</strong> — giving AI financial autonomy, responsibly.
</p>
