/**
 * Módulo de Áudio (Web Audio API)
 * Responsável exclusivamente pelos efeitos sonoros do jogo e notificações de chat.
 */

export class AudioManager {
  constructor() {
    this.audioCtx = null;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playFeedbackSound(type) {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const now = ctx.currentTime;

      if (type === 'correct') {
        // Som suave, harmônico e agudo suave para letra correta (verde)
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'present') {
        // Som suave e acolhedor para letra no lugar errado (amarelo)
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.12); // C#5
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch (e) {
      // Áudio silencioso se bloqueado pelo browser
    }
  }

  playChatNotificationSound() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Síntese de sino (bell chime) com harmônicos metálicos cristalinos e decaimento longo
      const fundamental = 1046.5; // C6
      const partials = [
        { ratio: 1.0, amp: 0.08, decay: 0.75 },   // Fundamental
        { ratio: 2.0, amp: 0.045, decay: 0.5 },   // Oitava brilhante
        { ratio: 2.756, amp: 0.03, decay: 0.35 }, // Harmônico metálico de sino
        { ratio: 4.07, amp: 0.018, decay: 0.22 }  // Brilho de ataque (strike)
      ];

      partials.forEach(({ ratio, amp, decay }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(fundamental * ratio, now);

        // Ataque imediato de percussão suave e ressonância longa de sino
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(amp, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + decay + 0.02);
      });
    } catch (e) {
      // Áudio silencioso se bloqueado pelo browser
    }
  }
}

