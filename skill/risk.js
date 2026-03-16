const WEIGHTS = {
  recipientReputation: 0.25,
  contractVerification: 0.20,
  transactionPattern: 0.15,
  simulationResult: 0.20,
  historicalBehavior: 0.10,
  networkConditions: 0.10,
};

export class RiskEngine {
  #allowlist;
  #blocklist;
  #history;

  constructor(config) {
    this.#allowlist = new Set(config.allowlist || []);
    this.#blocklist = new Set(config.blocklist || []);
    this.#history = [];
  }

  async evaluate(tx, simulation) {
    const signals = await Promise.all([
      this.#checkRecipient(tx.to),
      this.#checkContract(tx.to),
      this.#checkPattern(tx),
      this.#checkSimulation(simulation),
      this.#checkHistory(tx.to),
      this.#checkNetwork(),
    ]);

    const [recipient, contract, pattern, sim, history, network] = signals;

    const score =
      recipient.score * WEIGHTS.recipientReputation +
      contract.score * WEIGHTS.contractVerification +
      pattern.score * WEIGHTS.transactionPattern +
      sim.score * WEIGHTS.simulationResult +
      history.score * WEIGHTS.historicalBehavior +
      network.score * WEIGHTS.networkConditions;

    const details = { recipient, contract, pattern, sim, history, network };
    const flags = Object.values(details)
      .flatMap((s) => s.flags || [])
      .filter(Boolean);

    return {
      score: Math.round(score * 100) / 100,
      level: score < 0.3 ? 'low' : score < 0.6 ? 'medium' : 'high',
      flags,
      details,
    };
  }

  async #checkRecipient(address) {
    if (this.#blocklist.has(address)) {
      return { score: 1.0, flags: ['BLOCKLISTED_RECIPIENT'] };
    }
    if (this.#allowlist.has(address)) {
      return { score: 0.0, flags: [] };
    }
    return { score: 0.5, flags: ['UNKNOWN_RECIPIENT'] };
  }

  async #checkContract(address) {
    if (this.#allowlist.has(address)) {
      return { score: 0.0, flags: [] };
    }
    return { score: 0.4, flags: ['UNVERIFIED_CONTRACT'] };
  }

  async #checkPattern(tx) {
    const flags = [];
    let score = 0;

    if (tx.amount > 0.5) {
      score += 0.3;
      flags.push('LARGE_AMOUNT');
    }

    const recentTxCount = this.#history.filter(
      (h) => Date.now() - h.timestamp < 60_000,
    ).length;
    if (recentTxCount > 3) {
      score += 0.4;
      flags.push('RAPID_TRANSACTIONS');
    }

    return { score: Math.min(score, 1), flags };
  }

  async #checkSimulation(simulation) {
    if (!simulation) return { score: 0.3, flags: ['NO_SIMULATION'] };
    if (!simulation.success) return { score: 0.9, flags: ['SIMULATION_FAILED'] };
    return { score: 0.0, flags: [] };
  }

  async #checkHistory(address) {
    const pastTx = this.#history.filter((h) => h.to === address);
    if (pastTx.length === 0) {
      return { score: 0.3, flags: ['FIRST_INTERACTION'] };
    }
    const successRate = pastTx.filter((t) => t.success).length / pastTx.length;
    return { score: 1 - successRate, flags: [] };
  }

  async #checkNetwork() {
    return { score: 0.1, flags: [] };
  }

  recordTransaction(tx) {
    this.#history.push({
      to: tx.to,
      amount: tx.amount,
      timestamp: Date.now(),
      success: tx.status === 'approved',
    });
    if (this.#history.length > 1000) {
      this.#history = this.#history.slice(-1000);
    }
  }
}
