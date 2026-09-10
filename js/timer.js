/* Pure clock engine: injectable clock makes pause/resume and delayed ticks testable. */
(function (root) {
  'use strict';
  class BattleTimer {
    constructor(now = () => performance.now()) { this.now = now; this.duration = 1800000; this.reset(); }
    elapsed() { return Math.min(this.duration, this.accumulated + (this.running ? Math.max(0, this.now() - this.startedAt) : 0)); }
    start() { if (this.running || this.elapsed() >= this.duration) return; this.startedAt = this.now(); this.running = true; }
    pause() { this.accumulated = this.elapsed(); this.running = false; }
    reset() { this.accumulated = 0; this.startedAt = 0; this.running = false; this.fired = new Set(); }
    due(alerts) {
      if (!this.running) return [];
      const elapsed = this.elapsed();
      const due = alerts.filter(a => a.enabled && !this.fired.has(a.id) && a.seconds * 1000 <= elapsed).sort((a,b) => a.seconds - b.seconds);
      due.forEach(a => this.fired.add(a.id));
      if (elapsed >= this.duration) this.pause();
      return due;
    }
  }
  root.BattleTimer = BattleTimer;
})(globalThis);
