/**
 * Módulo de Cronômetro de Turno
 * Responsável exclusivamente pela contagem regressiva de 3 minutos por turno e exibição visual.
 */

export class TurnTimer {
  constructor(turnTimerElement, turnDuration = 180) {
    this.turnTimerElement = turnTimerElement;
    this.turnDuration = turnDuration;
    this.timeLeft = this.turnDuration;
    this.timerInterval = null;
  }

  start({ isGameOver, role, isMyTurnFn, onTimeout }) {
    this.stop();
    if (isGameOver || role === 'solo') {
      if (this.turnTimerElement) this.turnTimerElement.classList.add('hidden');
      return;
    }

    this.timeLeft = this.turnDuration;
    this.updateDisplay(isMyTurnFn());

    if (this.turnTimerElement) {
      this.turnTimerElement.classList.remove('hidden');
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
    if (!this.turnTimerElement) return;

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

    // Aos 30 segundos ou menos, fica vermelho
    if (this.timeLeft <= 30) {
      this.turnTimerElement.classList.add('warning');
    } else {
      this.turnTimerElement.classList.remove('warning');
    }
  }
}

