/**
 * Módulo de Interface do Tabuleiro, Teclado, Placar e Modais
 * Responsável pela manipulação de elementos visuais do tabuleiro 6x5, teclado virtual, animações e modais.
 */

import { ProfileManager } from './profile.js?v=1.6.11';

export class BoardUI {
  constructor({ maxRows = 6, wordLength = 5, audio, onTileClick, onVirtualKeyPress }) {
    this.maxRows = maxRows;
    this.wordLength = wordLength;
    this.audio = audio;
    this.onTileClick = onTileClick;
    this.onVirtualKeyPress = onVirtualKeyPress;
    this.keyboardStatus = {};

    this.initDOM();
  }

  initDOM() {
    this.lobbyScreen = document.getElementById('lobby-screen');
    this.boardContainer = document.getElementById('board-container');
    this.keyboardContainer = document.getElementById('keyboard-container');
    this.boardElement = document.getElementById('board');
    this.keyboardElement = document.getElementById('keyboard');
    this.statusBar = document.getElementById('game-status-bar');
    this.gameActionsBar = document.getElementById('game-actions-bar');
    this.btnHome = document.getElementById('btn-home');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.toastMessage = document.getElementById('toast-message');
    this.turnTimerElement = document.getElementById('turn-timer');

    // Badges jogadores e placar
    this.p1Badge = document.getElementById('p1-badge');
    this.p2Badge = document.getElementById('p2-badge');
    this.p1ScoreElement = document.getElementById('p1-score');
    this.p2ScoreElement = document.getElementById('p2-score');
    this.scoreVsElement = document.querySelector('.score-vs');

    this.p1AvatarImg = document.getElementById('p1-avatar-img');
    this.p1AvatarPh = document.getElementById('p1-avatar-ph');
    this.p2AvatarImg = document.getElementById('p2-avatar-img');
    this.p2AvatarPh = document.getElementById('p2-avatar-ph');

    // Elementos do Lobby
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.btnLockRoom = document.getElementById('btn-lock-room');
    this.iconLockOpen = document.getElementById('icon-lock-open');
    this.iconLockClosed = document.getElementById('icon-lock-closed');
    this.createRoomDesc = document.getElementById('create-room-desc');
    this.hostCodeDisplay = document.getElementById('host-code-display');
    this.hostPrivateCodeArea = document.getElementById('host-private-code-area');
    this.roomCodeVal = document.getElementById('room-code-val');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.hostStatus = document.getElementById('host-status');

    this.inputRoomCode = document.getElementById('input-room-code');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.btnJoinPublicRoom = document.getElementById('btn-join-public-room');
    this.joinStatus = document.getElementById('join-status');
    this.btnPractice = document.getElementById('btn-practice');

    // Modal de Salas Públicas
    this.publicRoomsModal = document.getElementById('public-rooms-modal');
    this.btnClosePublicRooms = document.getElementById('btn-close-public-rooms');
    this.btnRefreshPublicRooms = document.getElementById('btn-refresh-public-rooms');
    this.publicRoomsList = document.getElementById('public-rooms-list');

    // Modais
    this.helpModal = document.getElementById('help-modal');
    this.btnHelp = document.getElementById('btn-help');
    this.btnCloseHelp = document.getElementById('btn-close-help');
    this.btnHelpOk = document.getElementById('btn-help-ok');

    this.gameoverModal = document.getElementById('gameover-modal');
    this.privacyModal = document.getElementById('privacy-modal');
    this.btnPrivacy = document.getElementById('btn-privacy');
    this.btnClosePrivacy = document.getElementById('btn-close-privacy');
    this.btnPrivacyOk = document.getElementById('btn-privacy-ok');
    this.goTitle = document.getElementById('go-title');
    this.goSubtitle = document.getElementById('go-subtitle');
    this.goSecretWord = document.getElementById('go-secret-word');
    this.goWinnerName = document.getElementById('go-winner-name');
    this.goAttemptsCount = document.getElementById('go-attempts-count');
    this.btnPlayAgain = document.getElementById('btn-play-again');
    this.btnBackLobby = document.getElementById('btn-back-lobby');
    this.btnRestart = document.getElementById('btn-restart');

    // Modal de confirmação de saída (Botão Voltar / Sair)
    this.exitConfirmModal = document.getElementById('exit-confirm-modal');
    this.exitModalTitle = document.getElementById('exit-modal-title');
    this.exitModalDesc = document.getElementById('exit-modal-desc');
    this.btnCloseExit = document.getElementById('btn-close-exit');
    this.btnCancelExit = document.getElementById('btn-cancel-exit');
    this.btnConfirmExit = document.getElementById('btn-confirm-exit');
  }

  createBoard() {
    this.boardElement.innerHTML = '';
    for (let r = 0; r < this.maxRows; r++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'board-row';
      rowDiv.dataset.row = r;

      for (let c = 0; c < this.wordLength; c++) {
        const tileDiv = document.createElement('div');
        tileDiv.className = 'tile';
        tileDiv.dataset.row = r;
        tileDiv.dataset.col = c;

        tileDiv.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (this.onTileClick) this.onTileClick(r, c);
        });

        rowDiv.appendChild(tileDiv);
      }
      this.boardElement.appendChild(rowDiv);
    }
  }

  createKeyboard() {
    this.keyboardElement.innerHTML = '';
    this.keyboardStatus = {};
    const layout = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'BACKSPACE'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'ENTER']
    ];

    layout.forEach(rowKeys => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'keyboard-row';

      rowKeys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'key-btn';
        btn.dataset.key = k;

        if (k === 'ENTER') {
          btn.textContent = 'ENTER';
          btn.classList.add('action-key');
        } else if (k === 'BACKSPACE') {
          btn.innerHTML = '⌫';
          btn.classList.add('action-key');
        } else {
          btn.textContent = k;
        }

        btn.addEventListener('click', () => {
          if (this.onVirtualKeyPress) this.onVirtualKeyPress(k);
        });
        rowDiv.appendChild(btn);
      });

      this.keyboardElement.appendChild(rowDiv);
    });
  }

  getTileElement(r, c) {
    return this.boardElement.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
  }

  getRowElement(r) {
    return this.boardElement.querySelector(`.board-row[data-row="${r}"]`);
  }

  updateActiveTileHighlight({ currentRow, currentTile, isMyTurn, isGameOver, isRevealing }) {
    const allActive = this.boardElement.querySelectorAll('.tile.active-cursor');
    allActive.forEach(t => t.classList.remove('active-cursor'));

    const allRows = this.boardElement.querySelectorAll('.board-row');
    allRows.forEach(row => {
      if (parseInt(row.dataset.row, 10) === currentRow && isMyTurn && !isGameOver && !isRevealing) {
        row.classList.add('current-turn-row');
      } else {
        row.classList.remove('current-turn-row');
      }
    });

    if (isGameOver || isRevealing || !isMyTurn || currentRow >= this.maxRows) return;

    const colToHighlight = Math.min(currentTile, this.wordLength - 1);
    const activeTile = this.getTileElement(currentRow, colToHighlight);
    if (activeTile) {
      activeTile.classList.add('active-cursor');
    }
  }

  animateRowReveal(row, guess, evaluation, callback) {
    const flipDuration = 550; // ms
    const staggerDelay = 280; // ms entre cada letra

    for (let c = 0; c < this.wordLength; c++) {
      const tile = this.getTileElement(row, c);
      const status = evaluation[c];
      const letter = guess[c];

      setTimeout(() => {
        tile.classList.remove('opponent-typing');
        tile.classList.add('flip');

        // Na metade da rotação (90 graus) troca a cor do bloco
        setTimeout(() => {
          tile.classList.add(status);
          this.updateKeyboardKeyColor(letter, status);
          if ((status === 'correct' || status === 'present') && this.audio) {
            this.audio.playFeedbackSound(status);
          }
        }, flipDuration / 2);

        // Se for a última letra, aguarda o fim completo e dispara o callback
        if (c === this.wordLength - 1) {
          setTimeout(() => {
            if (callback) callback();
          }, flipDuration + 100);
        }
      }, c * staggerDelay);
    }
  }

  updateKeyboardKeyColor(letter, status) {
    const current = this.keyboardStatus[letter];
    if (current === 'correct') return;
    if (current === 'present' && status === 'absent') return;

    this.keyboardStatus[letter] = status;
    const keyBtn = this.keyboardElement.querySelector(`.key-btn[data-key="${letter}"]`);
    if (keyBtn) {
      keyBtn.classList.remove('correct', 'present', 'absent');
      keyBtn.classList.add(status);
    }
  }

  shakeRow(row) {
    const rowEl = this.getRowElement(row);
    if (rowEl) {
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth; // Force reflow
      rowEl.classList.add('shake');
    }
  }

  showToast(msg) {
    this.toastMessage.textContent = msg;
    this.toastMessage.classList.remove('hidden');
    setTimeout(() => {
      this.toastMessage.classList.add('hidden');
    }, 2200);
  }

  updateScoreDisplay(myScore, oppScore) {
    if (this.p1ScoreElement) this.p1ScoreElement.textContent = myScore;
    if (this.p2ScoreElement) this.p2ScoreElement.textContent = oppScore;
  }

  renderScoreboard({ role, myName, myAvatar, oppName, oppAvatar, myScore, oppScore, isMyTurn }) {
    this.statusBar.classList.remove('hidden');
    this.updateScoreDisplay(myScore, oppScore);

    if (this.p1Badge) {
      const p1Label = role === 'host' ? `${myName} (Host)` : myName;
      const p1NameEl = this.p1Badge.querySelector('.p-name');
      if (p1NameEl) p1NameEl.textContent = p1Label;
      ProfileManager.renderAvatarElement(this.p1AvatarImg, this.p1AvatarPh, myAvatar);
    }

    this.p2Badge.classList.remove('hidden');
    if (this.p1ScoreElement) this.p1ScoreElement.classList.remove('hidden');
    if (this.p2ScoreElement) this.p2ScoreElement.classList.remove('hidden');
    if (this.scoreVsElement) this.scoreVsElement.classList.remove('hidden');

    const p2Label = role === 'host' ? oppName : `${oppName} (Host)`;
    const p2NameEl = this.p2Badge.querySelector('.p-name');
    if (p2NameEl) p2NameEl.textContent = p2Label;
    ProfileManager.renderAvatarElement(this.p2AvatarImg, this.p2AvatarPh, oppAvatar);

    if (isMyTurn) {
      if (this.turnIndicator) this.turnIndicator.textContent = '';
      this.p1Badge.classList.remove('opponent-turn');
      this.p1Badge.classList.add('my-turn');
      this.p2Badge.classList.remove('my-turn', 'opponent-turn');
      this.keyboardElement.classList.remove('locked');
      this.showToast('Sua vez de jogar');
    } else {
      if (this.turnIndicator) this.turnIndicator.textContent = '';
      this.p1Badge.classList.remove('my-turn', 'opponent-turn');
      this.p2Badge.classList.remove('my-turn');
      this.p2Badge.classList.add('opponent-turn');
      this.keyboardElement.classList.add('locked');
    }
  }

  showHelpModal(show) {
    if (show) {
      this.helpModal.classList.remove('hidden');
    } else {
      this.helpModal.classList.add('hidden');
    }
  }

  showPrivacyModal(show) {
    if (!this.privacyModal) return;
    if (show) {
      this.privacyModal.classList.remove('hidden');
    } else {
      this.privacyModal.classList.add('hidden');
    }
  }

  showGameOverModal({ title, color, subtitle, secretWord, winnerName, attemptsText }) {
    this.goTitle.textContent = title;
    this.goTitle.style.color = color;
    this.goSubtitle.textContent = subtitle;
    this.goSecretWord.textContent = secretWord;
    this.goWinnerName.textContent = winnerName;
    this.goAttemptsCount.textContent = attemptsText;
    this.gameoverModal.classList.remove('hidden');
  }

  showExitConfirmModal(show, { title, desc, cancelText, confirmText } = {}) {
    if (!this.exitConfirmModal) return;
    if (show) {
      if (title && this.exitModalTitle) this.exitModalTitle.textContent = title;
      if (desc && this.exitModalDesc) this.exitModalDesc.textContent = desc;
      if (this.btnCancelExit) this.btnCancelExit.textContent = cancelText || 'Continuar jogando';
      if (this.btnConfirmExit) this.btnConfirmExit.textContent = confirmText || 'Voltar ao lobby';
      this.exitConfirmModal.classList.remove('hidden');
    } else {
      this.exitConfirmModal.classList.add('hidden');
    }
  }

  updateRoomLockUI(isLocked) {
    if (this.btnLockRoom) {
      this.btnLockRoom.classList.toggle('locked', isLocked);
      this.btnLockRoom.title = isLocked
        ? 'Sala trancada (Privada com código) — Toque para tornar pública'
        : 'Sala aberta (Pública sem código) — Toque para trancar';
    }
    if (this.iconLockOpen) this.iconLockOpen.classList.toggle('hidden', isLocked);
    if (this.iconLockClosed) this.iconLockClosed.classList.toggle('hidden', !isLocked);
    if (this.btnCreateRoom) {
      this.btnCreateRoom.textContent = isLocked ? 'Criar Sala Privada' : 'Criar Sala Pública';
    }
    if (this.createRoomDesc) {
      this.createRoomDesc.textContent = isLocked
        ? 'Crie uma sala e compartilhe o código de 6 dígitos com quem você ama.'
        : 'Sala aberta para qualquer jogador entrar sem código. Toque no cadeado para trancar.';
    }
  }

  showPublicRoomsModal(show) {
    if (!this.publicRoomsModal) return;
    if (show) {
      this.publicRoomsModal.classList.remove('hidden');
    } else {
      this.publicRoomsModal.classList.add('hidden');
    }
  }

  setPublicRoomsLoading() {
    if (!this.publicRoomsList) return;
    if (this.btnRefreshPublicRooms) this.btnRefreshPublicRooms.classList.add('spinning');
    this.publicRoomsList.innerHTML = '<div class="public-rooms-empty">Buscando salas públicas abertas...</div>';
  }

  renderPublicRoomsList(rooms, onSelectRoom) {
    if (!this.publicRoomsList) return;
    if (this.btnRefreshPublicRooms) this.btnRefreshPublicRooms.classList.remove('spinning');

    if (!rooms || rooms.length === 0) {
      this.publicRoomsList.innerHTML = '<div class="public-rooms-empty">Nenhuma sala pública aberta no momento.</div>';
      return;
    }

    this.publicRoomsList.innerHTML = '';
    rooms.forEach((room) => {
      const item = document.createElement('div');
      item.className = 'public-room-item';

      const hostWrap = document.createElement('div');
      hostWrap.className = 'public-room-host';

      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'public-room-avatar';
      if (room.hostAvatar && room.hostAvatar.startsWith('data:image')) {
        const img = document.createElement('img');
        img.src = room.hostAvatar;
        img.alt = room.hostName;
        avatarDiv.appendChild(img);
      } else {
        avatarDiv.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        `;
      }

      const infoDiv = document.createElement('div');
      infoDiv.className = 'public-room-info';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'public-room-name';
      nameSpan.textContent = `Sala de ${room.hostName}`;
      const subSpan = document.createElement('span');
      subSpan.className = 'public-room-sub';
      subSpan.textContent = 'Aberta • Aguardando oponente';
      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(subSpan);

      hostWrap.appendChild(avatarDiv);
      hostWrap.appendChild(infoDiv);

      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'btn btn-primary public-room-join-btn';
      joinBtn.textContent = 'Entrar';
      joinBtn.addEventListener('click', () => {
        if (onSelectRoom) onSelectRoom(room.slotId);
      });

      item.appendChild(hostWrap);
      item.appendChild(joinBtn);
      this.publicRoomsList.appendChild(item);
    });
  }
}

