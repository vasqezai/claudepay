export class ValidationStage {
  name = 'base';
  async validate() {
    return { pass: true };
  }
}

class SimulationStage extends ValidationStage {
  name = 'simulation';

  constructor(wallet) {
    super();
    this.wallet = wallet;
  }

  async validate(tx) {
    const sim = await this.wallet.simulateTransfer(tx.to, tx.amount);
    if (!sim.success) {
      return {
        pass: false,
        reason: `Simulation failed: ${JSON.stringify(sim.error)}`,
        code: 'SIMULATION_FAILED',
        data: sim,
      };
    }
    return { pass: true, data: sim };
  }
}

class SecurityStage extends ValidationStage {
  name = 'security';

  constructor(riskEngine) {
    super();
    this.riskEngine = riskEngine;
  }

  async validate(tx, context) {
    const risk = await this.riskEngine.evaluate(tx, context.simulation);
    if (risk.flags.includes('BLOCKLISTED_RECIPIENT')) {
      return {
        pass: false,
        reason: 'Recipient is blocklisted',
        code: 'BLOCKLISTED',
        data: risk,
      };
    }
    return { pass: true, data: risk };
  }
}

class NecessityStage extends ValidationStage {
  name = 'necessity';

  async validate(tx) {
    const necessity = this.#evaluateNecessity(tx.reason, tx.taskContext);
    if (necessity.level === 'none') {
      return {
        pass: false,
        reason: `Purchase not necessary: ${necessity.explanation}`,
        code: 'NOT_NECESSARY',
        data: necessity,
      };
    }
    return { pass: true, data: necessity };
  }

  #evaluateNecessity(reason, taskContext) {
    if (!reason || !taskContext) {
      return { level: 'low', explanation: 'Insufficient context provided' };
    }

    const highKeywords = ['required', 'essential', 'needed', 'must', 'critical', 'necessary'];
    const lowKeywords = ['nice to have', 'optional', 'maybe', 'could', 'might'];

    const reasonLower = `${reason} ${taskContext}`.toLowerCase();
    const hasHigh = highKeywords.some((k) => reasonLower.includes(k));
    const hasLow = lowKeywords.some((k) => reasonLower.includes(k));

    if (hasHigh && !hasLow) return { level: 'high', explanation: 'Resource is essential for the task' };
    if (hasLow && !hasHigh) return { level: 'low', explanation: 'Resource appears optional' };
    return { level: 'medium', explanation: 'Moderate necessity detected' };
  }
}

class LimitStage extends ValidationStage {
  name = 'limits';

  constructor(wallet) {
    super();
    this.wallet = wallet;
  }

  async validate(tx) {
    const usage = this.wallet.getDailyUsage();
    if (tx.amount > usage.remaining) {
      return {
        pass: false,
        reason: `Insufficient daily budget. Remaining: ${usage.remaining} SOL`,
        code: 'DAILY_LIMIT',
        data: usage,
      };
    }
    return { pass: true, data: usage };
  }
}

export class ValidatorAgent {
  #stages = [];

  constructor(wallet, riskEngine, config) {
    if (config.simulate !== false) {
      this.#stages.push(new SimulationStage(wallet));
    }
    if (config.checkContract !== false) {
      this.#stages.push(new SecurityStage(riskEngine));
    }
    if (config.evaluateNecessity !== false) {
      this.#stages.push(new NecessityStage());
    }
    this.#stages.push(new LimitStage(wallet));

    if (config.customStages) {
      this.#stages.push(...config.customStages);
    }
  }

  async validate(tx) {
    const context = {};
    const stageResults = [];

    for (const stage of this.#stages) {
      const result = await stage.validate(tx, context);
      stageResults.push({ stage: stage.name, ...result });

      if (result.data) {
        context[stage.name] = result.data;
      }

      if (!result.pass) {
        return {
          approved: false,
          failedStage: stage.name,
          reason: result.reason,
          code: result.code,
          stages: stageResults,
          context,
        };
      }
    }

    return {
      approved: true,
      stages: stageResults,
      context,
    };
  }
}
