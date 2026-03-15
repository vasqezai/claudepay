import { EventEmitter } from 'events';
import { resolveConfig } from './config.js';
import { Wallet, LimitError } from './wallet.js';
import { RiskEngine } from './risk.js';
import { ValidatorAgent, ValidationStage } from './validator.js';

export { ValidationStage };

export class CLPay extends EventEmitter {
  #wallet;
  #riskEngine;
  #validator;
  #config;
  #auditLog = [];

  constructor(userConfig) {
    super();
    this.#config = resolveConfig(userConfig);
    this.#wallet = new Wallet(this.#config);
    this.#riskEngine = new RiskEngine(this.#config);
    this.#validator = new ValidatorAgent(
      this.#wallet,
      this.#riskEngine,
      this.#config.validator,
    );
  }

  async pay(options) {
    const tx = this.#normalizeTx(options);
    this.emit('payment:initiated', tx);

    try {
      const validation = await this.#validator.validate(tx);

      for (const stage of validation.stages) {
        this.emit('validation:stage', stage.stage, stage);
      }

      if (!validation.approved) {
        const result = this.#buildRejection(tx, validation);
        this.#riskEngine.recordTransaction({ ...tx, status: 'rejected' });
        this.#log(tx, result);
        this.emit('payment:rejected', tx, result.rejection);
        return result;
      }

      const riskScore = validation.context.security?.score ?? 0;
      if (riskScore > this.#config.riskThreshold) {
        const result = {
          status: 'rejected',
          riskScore,
          necessity: validation.context.necessity?.level ?? 'unknown',
          simulation: validation.context.simulation ?? null,
          rejection: {
            reason: `Risk score ${riskScore} exceeds threshold ${this.#config.riskThreshold}`,
            code: 'RISK_THRESHOLD',
            details: validation.context.security,
          },
        };
        this.#riskEngine.recordTransaction({ ...tx, status: 'rejected' });
        this.#log(tx, result);
        this.emit('payment:rejected', tx, result.rejection);
        return result;
      }

      this.emit('payment:approved', tx, validation);
      const execution = await this.#wallet.executeTransfer(tx.to, tx.amount);

      const result = {
        status: 'approved',
        txHash: execution.signature,
        riskScore,
        necessity: validation.context.necessity?.level ?? 'unknown',
        simulation: validation.context.simulation ?? null,
      };

      this.#riskEngine.recordTransaction({ ...tx, status: 'approved' });
      this.#log(tx, result);
      this.emit('payment:executed', tx, execution.signature);

      const usage = this.#wallet.getDailyUsage();
      if (usage.spent / usage.limit > 0.8) {
        this.emit('limit:warning', usage);
      }

      return result;
    } catch (err) {
      if (err instanceof LimitError) {
        const result = {
          status: 'rejected',
          rejection: { reason: err.message, code: err.code, details: {} },
        };
        this.#log(tx, result);
        this.emit('payment:rejected', tx, result.rejection);
        return result;
      }
      throw err;
    }
  }

  async simulate(options) {
    const tx = this.#normalizeTx(options);
    return this.#wallet.simulateTransfer(tx.to, tx.amount);
  }

  async getBalance() {
    return this.#wallet.getBalance();
  }

  getHistory(options = {}) {
    let entries = [...this.#auditLog];

    if (options.status && options.status !== 'all') {
      entries = entries.filter((e) => e.result.status === options.status);
    }
    if (options.from) {
      entries = entries.filter((e) => e.timestamp >= options.from.getTime());
    }
    if (options.to) {
      entries = entries.filter((e) => e.timestamp <= options.to.getTime());
    }
    if (options.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  destroy() {
    this.#wallet.destroy();
    this.removeAllListeners();
  }

  #normalizeTx(options) {
    if (!options.to) throw new Error('Recipient address (to) is required');
    if (!options.amount || options.amount <= 0) throw new Error('Amount must be positive');
    if (!options.reason) throw new Error('Payment reason is required');

    return {
      to: options.to,
      amount: options.amount,
      token: options.token || 'SOL',
      reason: options.reason,
      taskContext: options.taskContext || '',
      priority: options.priority || 'medium',
      memo: options.memo || '',
      timestamp: Date.now(),
    };
  }

  #buildRejection(tx, validation) {
    return {
      status: 'rejected',
      riskScore: validation.context.security?.score ?? null,
      necessity: validation.context.necessity?.level ?? null,
      simulation: validation.context.simulation ?? null,
      rejection: {
        reason: validation.reason,
        code: validation.code,
        details: {
          failedStage: validation.failedStage,
          stages: validation.stages,
        },
      },
    };
  }

  #log(tx, result) {
    this.#auditLog.push({
      tx,
      result,
      timestamp: Date.now(),
    });
  }
}
