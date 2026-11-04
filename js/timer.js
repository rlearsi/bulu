/**
 * Módulo de Cronômetro de Turno
 * Responsável exclusivamente pela contagem regressiva de 1 minuto por turno e exibição visual.
 */

export class TurnTimer {
  constructor(turnTimerElement, turnDuration = 60) {
    this.turnTimerElement = turnTimerElement;
    this.turnDuration = turnDuration;
    this.timeLeft = this.turnDuration;
    this.timerInterval = null;
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.useBar] Quando true (mais de 2 jogadores), oculta o relógio textual
   *   e informa o tempo restante via onTick para a barra de progresso do badge.
   * @param {(timeLeft: number, duration: number) => void} [opts.onTick]
   */
  start({ isGameOver, role, isMyTurnFn, onTimeout, useBar = false, onTick = null }) {
    this.stop();
    this.useBar = useBar;
    this.onTick = onTick;
    if (isGameOver || role === 'solo') {
      if (this.turnTimerElement) this.turnTimerElement.classList.add('hidden');
      return;
    }

    this.timeLeft = this.turnDuration;
    this.updateDisplay(isMyTurnFn());

    if (this.turnTimerElement) {
      this.turnTimerElement.classList.toggle('hidden', useBar);
    }

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.updateDisplay(isMyTurnFn());
        if (onTimeout) onTimeout();
      } else {
        this.updateDisplay(isMyTurnFn());
      }
    }, 1000);
  }

  stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.turnTimerElement) {
      this.turnTimerElement.classList.remove('warning');
    }
  }

  hide() {
    this.stop();
    if (this.turnTimerElement) {
      this.turnTimerElement.classList.add('hidden');
    }
  }

  updateDisplay(myTurn) {
    if (this.onTick) this.onTick(this.timeLeft, this.turnDuration);
    if (!this.turnTimerElement || this.useBar) return;

    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.turnTimerElement.textContent = formatted;

    if (myTurn) {
      this.turnTimerElement.classList.add('my-turn');
      this.turnTimerElement.classList.remove('opponent-turn');
    } else {
      this.turnTimerElement.classList.add('opponent-turn');
      this.turnTimerElement.classList.remove('my-turn');
    }

    // Nos últimos 15 segundos, fica vermelho
    if (this.timeLeft <= 15) {
      this.turnTimerElement.classList.add('warning');
    } else {
      this.turnTimerElement.classList.remove('warning');
    }
  }
}

