import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { createDecipheriv, createCipheriv, randomBytes } from 'crypto';

export class Wallet {
  #keypair = null;
  #connection = null;
  #dailySpent = 0;
  #dailyResetAt = 0;

  constructor(config) {
    this.config = config;
    this.#connection = new Connection(config.rpcUrl, 'confirmed');
    this.#loadKeypair(config.wallet);
  }

  #loadKeypair(walletPath) {
    try {
      const raw = readFileSync(walletPath, 'utf-8');
      const secretKey = Uint8Array.from(JSON.parse(raw));
      this.#keypair = Keypair.fromSecretKey(secretKey);
    } catch (err) {
      throw new Error(`Failed to load wallet: ${err.message}`);
    }
  }

  get publicKey() {
    return this.#keypair.publicKey.toBase58();
  }

  async getBalance() {
    const lamports = await this.#connection.getBalance(this.#keypair.publicKey);
    return {
      sol: lamports / LAMPORTS_PER_SOL,
      lamports,
    };
  }

  async simulateTransfer(to, amountSol) {
    const transaction = this.#buildTransfer(to, amountSol);
    const result = await this.#connection.simulateTransaction(transaction);

    return {
      success: result.value.err === null,
      logs: result.value.logs || [],
      unitsConsumed: result.value.unitsConsumed || 0,
      balanceChange: -amountSol,
      error: result.value.err,
    };
  }

  async executeTransfer(to, amountSol, memo) {
    this.#checkDailyLimit(amountSol);

    const transaction = this.#buildTransfer(to, amountSol);

    const signature = await sendAndConfirmTransaction(
      this.#connection,
      transaction,
      [this.#keypair],
    );

    this.#dailySpent += amountSol;

    return {
      signature,
      amount: amountSol,
      to,
      timestamp: Date.now(),
    };
  }

  #buildTransfer(to, amountSol) {
    const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
    const recipient = new PublicKey(to);

    return new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.#keypair.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );
  }

  #checkDailyLimit(amount) {
    const now = Date.now();
    if (now > this.#dailyResetAt) {
      this.#dailySpent = 0;
      this.#dailyResetAt = now + 24 * 60 * 60 * 1000;
    }

    if (amount > this.config.limits.perTransaction) {
      throw new LimitError(
        `Amount ${amount} SOL exceeds per-transaction limit of ${this.config.limits.perTransaction} SOL`,
        'PER_TX_LIMIT',
      );
    }

    if (this.#dailySpent + amount > this.config.limits.daily) {
      throw new LimitError(
        `Daily limit of ${this.config.limits.daily} SOL would be exceeded`,
        'DAILY_LIMIT',
      );
    }
  }

  getDailyUsage() {
    return {
      spent: this.#dailySpent,
      limit: this.config.limits.daily,
      remaining: Math.max(0, this.config.limits.daily - this.#dailySpent),
      resetsAt: this.#dailyResetAt,
    };
  }

  destroy() {
    if (this.#keypair) {
      this.#keypair.secretKey.fill(0);
      this.#keypair = null;
    }
  }
}

export class LimitError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LimitError';
    this.code = code;
  }
}
