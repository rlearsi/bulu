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
    this.lobbyHomeView = document.getElementById('lobby-home-view');
    this.roomSetupView = document.getElementById('room-setup-view');
    this.btnBackFromSetup = document.getElementById('btn-back-from-setup');
    this.setupOpenRoomRow = document.getElementById('setup-open-room-row');
    this.btnSetupOpenRoom = document.getElementById('btn-setup-open-room');
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.btnRoomConfigToggle = document.getElementById('btn-room-config-toggle');
    this.roomConfigPanel = document.getElementById('room-config-panel');
    this.btnCfgModeDropdown = document.getElementById('btn-cfg-mode-dropdown');
    this.cfgModeDropdownLabel = document.getElementById('cfg-mode-dropdown-label');
    this.cfgModePopover = document.getElementById('cfg-mode-popover');
    this.btnCfgPlayersDropdown = document.getElementById('btn-cfg-players-dropdown');
    this.cfgPlayersDropdownVal = document.getElementById('cfg-players-dropdown-val');
    this.cfgPlayersPopover = document.getElementById('cfg-players-popover');
    this.cfgPlayersGroup = document.getElementById('cfg-players-group');
    this.cfgModeGroup = document.getElementById('cfg-mode-popover');
    this.cfgIndividualRevealItem = document.getElementById('cfg-individual-reveal-item');
    this.btnCfgCursorDropdown = document.getElementById('btn-cfg-cursor-dropdown');
    this.cfgCursorDropdownLabel = document.getElementById('cfg-cursor-dropdown-label');
    this.cfgCursorPopover = document.getElementById('cfg-cursor-popover');
    this.cfgCursorGroup = document.getElementById('cfg-cursor-popover');
    this.btnCfgRevealDropdown = document.getElementById('btn-cfg-reveal-dropdown');
    this.cfgRevealDropdownLabel = document.getElementById('cfg-reveal-dropdown-label');
    this.cfgRevealPopover = document.getElementById('cfg-reveal-popover');
    this.cfgRevealGroup = document.getElementById('cfg-reveal-popover');

    // Dropdowns Seção: Tempo e Turnos
    this.btnCfgTimeDropdown = document.getElementById('btn-cfg-time-dropdown');
    this.cfgTimeDropdownLabel = document.getElementById('cfg-time-dropdown-label');
    this.cfgTimePopover = document.getElementById('cfg-time-popover');
    this.cfgTimeGroup = document.getElementById('cfg-time-popover');

    this.btnCfgCommsDropdown = document.getElementById('btn-cfg-comms-dropdown');
    this.cfgCommsDropdownLabel = document.getElementById('cfg-comms-dropdown-label');
    this.cfgCommsPopover = document.getElementById('cfg-comms-popover');
    this.cfgCommsGroup = document.getElementById('cfg-comms-popover');

    // Dropdowns Seção: Quem começa?
    this.btnCfgStarterFirstDropdown = document.getElementById('btn-cfg-starter-first-dropdown');
    this.cfgStarterFirstLabel = document.getElementById('cfg-starter-first-label');
    this.cfgStarterFirstPopover = document.getElementById('cfg-starter-first-popover');
    this.cfgStarterFirstGroup = document.getElementById('cfg-starter-first-popover');

    this.btnCfgStarterNextDropdown = document.getElementById('btn-cfg-starter-next-dropdown');
    this.cfgStarterNextLabel = document.getElementById('cfg-starter-next-label');
    this.cfgStarterNextPopover = document.getElementById('cfg-starter-next-popover');
    this.cfgStarterNextGroup = document.getElementById('cfg-starter-next-popover');

    // Reações e Emojis Flutuantes
    this.btnReactions = document.getElementById('btn-reactions');
    this.reactionsBar = document.getElementById('reactions-bar');
    this.floatingEmojisContainer = document.getElementById('floating-emojis-container');
    this.btnChat = document.getElementById('btn-chat');
    this.btnVoice = document.getElementById('btn-voice');

    this.cfgPrivacyGroup = document.getElementById('cfg-privacy-group');

    this.createRoomDesc = document.getElementById('create-room-desc');
    this.hostCodeDisplay = document.getElementById('host-code-display');
    this.hostPrivateCodeArea = document.getElementById('host-private-code-area');
    this.roomCodeVal = document.getElementById('room-code-val');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.hostStatus = document.getElementById('host-status');
    this.lobbyRoomPlayersWrap = document.getElementById('lobby-room-players-wrap');
    this.lobbyRoomPlayersList = document.getElementById('lobby-room-players-list');
    this.btnStartMatch = document.getElementById('btn-start-match');
    this.btnCancelRoom = document.getElementById('btn-cancel-room');
    this.gameModeHint = document.getElementById('game-mode-hint');
    this.btnMaxPlayers = document.getElementById('btn-max-players');
    this.maxPlayersVal = document.getElementById('max-players-val');
    this.maxPlayersPopover = document.getElementById('max-players-popover');
    this.matchScoreboard = document.querySelector('.match-scoreboard');
    this.multiScoreboard = document.getElementById('multi-scoreboard');
    this.infiniteScoreboard = document.getElementById('infinite-scoreboard');
    this.infiniteStreakVal = document.getElementById('infinite-streak-val');
    this.infiniteBestVal = document.getElementById('infinite-best-val');

    this.inputRoomCode = document.getElementById('input-room-code');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.btnJoinPublicRoom = document.getElementById('btn-join-public-room');
    this.joinStatus = document.getElementById('join-status');
    this.btnPractice = document.getElementById('btn-practice');
    this.btnSoloMode = document.getElementById('btn-solo-mode');
    this.soloModePopover = document.getElementById('solo-mode-popover');
    this.soloModeHint = document.getElementById('solo-mode-hint');

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
    this.goWinnerLabel = document.getElementById('go-winner-label');
    this.goWinnerName = document.getElementById('go-winner-name');
    this.goAttemptsLabel = document.getElementById('go-attempts-label');
    this.goAttemptsCount = document.getElementById('go-attempts-count');
    this.goSecretLabel = document.querySelector('.reveal-secret-box span');
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

    // Modal de Palavras Acertadas da Partida
    this.wordsHistoryModal = document.getElementById('words-history-modal');
    this.wordsHistoryList = document.getElementById('words-history-list');
    this.btnWordsHistory = document.getElementById('btn-words-history');
    this.btnCloseWordsHistory = document.getElementById('btn-close-words-history');
    this.btnWordsHistoryOk = document.getElementById('btn-words-history-ok');
  }

  createBoard() {
    this.boardElement.innerHTML = '';
    this.boardElement.style.setProperty('--rows', this.maxRows);
    this.boardElement.style.gridTemplateRows = `repeat(${this.maxRows}, 1fr)`;
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

  updateActiveTileHighlight({ currentRow, currentTile, isMyTurn, isGameOver, isRevealing, opponentCursor = null }) {
    const allActive = this.boardElement.querySelectorAll('.tile.active-cursor');
    allActive.forEach(t => t.classList.remove('active-cursor'));

    const allOppCursor = this.boardElement.querySelectorAll('.tile.opponent-cursor');
    allOppCursor.forEach(t => t.classList.remove('opponent-cursor'));

    const allRows = this.boardElement.querySelectorAll('.board-row');
    allRows.forEach(row => {
      if (parseInt(row.dataset.row, 10) === currentRow && isMyTurn && !isGameOver && !isRevealing) {
        row.classList.add('current-turn-row');
      } else {
        row.classList.remove('current-turn-row');
      }
    });

    if (opponentCursor && !isGameOver && typeof opponentCursor.row === 'number' && typeof opponentCursor.col === 'number') {
      const oppTile = this.getTileElement(opponentCursor.row, opponentCursor.col);
      if (oppTile) oppTile.classList.add('opponent-cursor');
    }

    if (isGameOver || isRevealing || !isMyTurn || currentRow >= this.maxRows) return;

    const colToHighlight = Math.min(currentTile, this.wordLength - 1);
    const activeTile = this.getTileElement(currentRow, colToHighlight);
    if (activeTile) {
      activeTile.classList.add('active-cursor');
    }
  }

  animateRowReveal(row, guess, evaluation, callback, showLetters = true) {
    const flipDuration = 550; // ms
    const staggerDelay = 280; // ms entre cada letra

    for (let c = 0; c < this.wordLength; c++) {
      const tile = this.getTileElement(row, c);
      const status = evaluation[c];
      const letter = guess[c];

      setTimeout(() => {
        tile.classList.remove('opponent-typing', 'hint-absent', 'hint-present');
        tile.classList.add('flip');

        // Na metade da rotação (90 graus) troca a cor do bloco
        setTimeout(() => {
          if (!showLetters) tile.textContent = '';
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

  /**
   * Renderiza o placar conforme a quantidade de jogadores:
   * - 2 jogadores: placar clássico (foto, nome e "X × Y" ao centro, com relógio)
   * - 3 jogadores: badges compactos numa única linha
   * - 4 jogadores: badges compactos em grade 2x2
   * Em 3+ jogadores o tempo de turno é exibido como barra de progresso no badge.
   */
  renderScoreboard({ players, myId, currentTurnId, isMyTurn, silent = false, turnless = false }) {
    this.statusBar.classList.remove('hidden');
    if (this.infiniteScoreboard) this.infiniteScoreboard.classList.add('hidden');
    const hostId = players.length ? players[0].id : '';
    const isMulti = players.length > 2;

    if (this.matchScoreboard) this.matchScoreboard.classList.toggle('hidden', isMulti);
    if (this.multiScoreboard) this.multiScoreboard.classList.toggle('hidden', !isMulti);

    if (isMulti) {
      this.renderMultiScoreboard({ players, myId, hostId, currentTurnId: turnless ? '' : currentTurnId });
    } else {
      const me = players.find(p => p.id === myId) || { name: 'Você', avatar: '', score: 0 };
      const opp = players.find(p => p.id !== myId) || { name: 'Oponente', avatar: '', score: 0, id: '' };
      this.updateScoreDisplay(me.score, opp.score);

      if (this.p1Badge) {
        const p1Label = myId === hostId ? `${me.name} (Host)` : me.name;
        const p1NameEl = this.p1Badge.querySelector('.p-name');
        if (p1NameEl) p1NameEl.textContent = p1Label;
        ProfileManager.renderAvatarElement(this.p1AvatarImg, this.p1AvatarPh, me.avatar);
      }

      this.p2Badge.classList.remove('hidden');
      if (this.p1ScoreElement) this.p1ScoreElement.classList.remove('hidden');
      if (this.p2ScoreElement) this.p2ScoreElement.classList.remove('hidden');
      if (this.scoreVsElement) this.scoreVsElement.classList.remove('hidden');

      const p2Label = opp.id === hostId ? `${opp.name} (Host)` : opp.name;
      const p2NameEl = this.p2Badge.querySelector('.p-name');
      if (p2NameEl) p2NameEl.textContent = p2Label;
      ProfileManager.renderAvatarElement(this.p2AvatarImg, this.p2AvatarPh, opp.avatar);

      if (turnless) {
        this.p1Badge.classList.remove('my-turn', 'opponent-turn');
        this.p2Badge.classList.remove('my-turn', 'opponent-turn');
      } else if (isMyTurn) {
        this.p1Badge.classList.remove('opponent-turn');
        this.p1Badge.classList.add('my-turn');
        this.p2Badge.classList.remove('my-turn', 'opponent-turn');
      } else {
        this.p1Badge.classList.remove('my-turn', 'opponent-turn');
        this.p2Badge.classList.remove('my-turn');
        this.p2Badge.classList.add('opponent-turn');
      }
    }

    if (this.turnIndicator) this.turnIndicator.textContent = '';
    if (turnless) {
      this.keyboardElement.classList.toggle('locked', !isMyTurn);
    } else if (isMyTurn) {
      this.keyboardElement.classList.remove('locked');
      if (!silent) this.showToast('Sua vez de jogar');
    } else {
      this.keyboardElement.classList.add('locked');
    }
  }

  renderMultiScoreboard({ players, myId, hostId, currentTurnId }) {
    if (!this.multiScoreboard) return;
    this.multiScoreboard.classList.toggle('grid-2x2', players.length >= 4);
    this.multiScoreboard.innerHTML = '';

    players.forEach((p) => {
      const badge = document.createElement('div');
      badge.className = 'multi-badge';
      badge.dataset.id = p.id;
      if (p.id === currentTurnId) badge.classList.add(p.id === myId ? 'my-turn' : 'opponent-turn');
      if (p.id === myId) badge.classList.add('is-me');

      const bar = document.createElement('div');
      bar.className = 'multi-badge-bar';
      badge.appendChild(bar);

      const avatar = document.createElement('div');
      avatar.className = 'multi-badge-avatar';
      if (p.avatar && p.avatar.startsWith('data:image')) {
        const img = document.createElement('img');
        img.src = p.avatar;
        img.alt = p.name;
        avatar.appendChild(img);
      } else {
        avatar.innerHTML = `
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>`;
      }

      const name = document.createElement('span');
      name.className = 'multi-badge-name';
      name.textContent = p.id === myId ? 'Você' : p.name;
      if (p.id === hostId) name.title = `${p.name} (Host)`;

      const score = document.createElement('span');
      score.className = 'multi-badge-score';
      score.textContent = p.score;

      badge.appendChild(avatar);
      badge.appendChild(name);
      badge.appendChild(score);
      this.multiScoreboard.appendChild(badge);
    });
  }

  /** Atualiza a barra de tempo do jogador da vez (placar 3+ jogadores). */
  updateTurnBar(currentTurnId, timeLeft, duration) {
    if (!this.multiScoreboard) return;
    const ratio = duration > 0 ? Math.max(0, Math.min(1, timeLeft / duration)) : 0;
    this.multiScoreboard.querySelectorAll('.multi-badge').forEach((badge) => {
      const bar = badge.querySelector('.multi-badge-bar');
      if (!bar) return;
      const isActive = badge.dataset.id === currentTurnId;
      bar.style.width = isActive ? `${ratio * 100}%` : '0%';
      badge.classList.toggle('warning', isActive && timeLeft <= 15);
    });
  }

  updateMaxPlayersUI(value) {
    if (this.cfgPlayersGroup) {
      this.cfgPlayersGroup.querySelectorAll('.max-players-option, .cfg-toggle-btn').forEach((btn) => {
        btn.classList.toggle('selected', Number(btn.dataset.value) === value);
      });
    }
    if (this.cfgPlayersDropdownVal) {
      this.cfgPlayersDropdownVal.textContent = String(value);
    }
  }

  updateGameModeUI(mode, revealLetters) {
    const info = {
      normal: revealLetters
        ? 'Modo Normal: uma grade compartilhada, jogada em turnos.'
        : 'Modo Normal: uma grade compartilhada, jogada em turnos (letras do oponente ocultas até enviar).' ,
      cross: revealLetters
        ? 'Modo Cruzado: cada um tem sua grade e palavra; palpites exibem letras.'
        : 'Modo Cruzado: cada um tem sua grade e palavra; palpites dos oponentes exibem apenas cores.',
      individual: revealLetters
        ? 'Modo Individual: todos jogam ao mesmo tempo; grades dos oponentes com letras.'
        : 'Modo Individual: todos jogam ao mesmo tempo; grades dos oponentes só com cores.'
    };
    const modeNames = {
      normal: 'Normal',
      cross: 'Cruzado',
      individual: 'Individual'
    };
    if (this.cfgModeGroup) {
      this.cfgModeGroup.querySelectorAll('.cfg-popover-option, .cfg-toggle-btn').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.mode === mode);
      });
    }
    if (this.cfgModeDropdownLabel) {
      this.cfgModeDropdownLabel.textContent = modeNames[mode] || 'Normal';
    }
    ['normal', 'cross', 'individual'].forEach((m) => {
      const icon = document.getElementById(`cfg-icon-mode-${m}`);
      if (icon) icon.classList.toggle('hidden', m !== mode);
    });
    if (this.cfgRevealGroup) {
      this.cfgRevealGroup.querySelectorAll('.cfg-popover-option, .cfg-toggle-btn').forEach((btn) => {
        btn.classList.toggle('selected', (btn.dataset.reveal === 'true') === revealLetters);
      });
    }
    if (this.cfgRevealDropdownLabel) {
      this.cfgRevealDropdownLabel.textContent = revealLetters ? 'Com Letras' : 'Apenas Cores';
    }
    const iconLetters = document.getElementById('cfg-icon-reveal-letters');
    const iconColors = document.getElementById('cfg-icon-reveal-colors');
    if (iconLetters && iconColors) {
      iconLetters.classList.toggle('hidden', !revealLetters);
      iconColors.classList.toggle('hidden', revealLetters);
    }
    if (this.cfgIndividualRevealItem) {
      // No Modo Normal os jogadores dividem a mesma grade única, então exibe "Mostrar tudo" e fica inativo
      const isMultiBoard = mode !== 'normal';
      this.cfgIndividualRevealItem.classList.toggle('disabled', !isMultiBoard);
      if (this.btnCfgRevealDropdown) {
        this.btnCfgRevealDropdown.disabled = !isMultiBoard;
        this.btnCfgRevealDropdown.tabIndex = isMultiBoard ? 0 : -1;
      }
      if (!isMultiBoard && this.cfgRevealDropdownLabel) {
        this.cfgRevealDropdownLabel.textContent = 'Mostrar tudo';
      }
    }
    if (this.gameModeHint) this.gameModeHint.textContent = info[mode];
  }

  updateRoomConfigUI({ isRoomLocked, showOpponentSelection, firstRoundStarter, nextRoundStarterRule, turnDuration, roomComms }) {
    if (this.cfgPrivacyGroup) {
      this.cfgPrivacyGroup.querySelectorAll('.cfg-toggle-btn').forEach((btn) => {
        btn.classList.toggle('selected', (btn.dataset.locked === 'true') === isRoomLocked);
      });
    }
    if (this.cfgCursorGroup) {
      this.cfgCursorGroup.querySelectorAll('.cfg-popover-option, .cfg-toggle-btn').forEach((btn) => {
        btn.classList.toggle('selected', (btn.dataset.cursor === 'true') === showOpponentSelection);
      });
    }
    if (this.cfgCursorDropdownLabel) {
      this.cfgCursorDropdownLabel.textContent = showOpponentSelection ? 'Permitir Seleção' : 'Ocultar Seleção';
    }
    const iconAllow = document.getElementById('cfg-icon-cursor-allow');
    const iconHide = document.getElementById('cfg-icon-cursor-hide');
    if (iconAllow && iconHide) {
      iconAllow.classList.toggle('hidden', !showOpponentSelection);
      iconHide.classList.toggle('hidden', showOpponentSelection);
    }

    if (turnDuration) {
      if (this.cfgTimeGroup) {
        this.cfgTimeGroup.querySelectorAll('.turn-time-option, .cfg-popover-option').forEach((btn) => {
          btn.classList.toggle('selected', Number(btn.dataset.time) === turnDuration);
        });
      }
      const timeLabels = {
        60: '1min',
        120: '2min',
        180: '3min'
      };
      if (this.cfgTimeDropdownLabel) {
        this.cfgTimeDropdownLabel.textContent = timeLabels[turnDuration] || `${Math.round(turnDuration / 60)}min`;
      }
    }

    if (roomComms) {
      if (this.cfgCommsGroup) {
        this.cfgCommsGroup.querySelectorAll('.cfg-popover-option').forEach((btn) => {
          btn.classList.toggle('selected', btn.dataset.comms === roomComms);
        });
      }
      const commsLabels = {
        both: 'Texto e Voz',
        text: 'Apenas Texto',
        voice: 'Apenas Voz',
        none: 'Desativado'
      };
      if (this.cfgCommsDropdownLabel) {
        this.cfgCommsDropdownLabel.textContent = commsLabels[roomComms] || 'Texto e Voz';
      }
      ['both', 'text', 'voice', 'none'].forEach((mode) => {
        const icon = document.getElementById(`cfg-icon-comms-${mode}`);
        if (icon) icon.classList.toggle('hidden', mode !== roomComms);
      });
    }

    if (firstRoundStarter) {
      if (this.cfgStarterFirstGroup) {
        this.cfgStarterFirstGroup.querySelectorAll('.cfg-popover-option').forEach((btn) => {
          btn.classList.toggle('selected', btn.dataset.starterFirst === firstRoundStarter);
        });
      }
      if (this.cfgStarterFirstLabel) {
        this.cfgStarterFirstLabel.textContent = firstRoundStarter === 'random' ? '1ª: Aleatório' : '1ª: Host';
      }
      const iconFirstHost = document.getElementById('cfg-icon-starter-first-host');
      const iconFirstRandom = document.getElementById('cfg-icon-starter-first-random');
      if (iconFirstHost && iconFirstRandom) {
        iconFirstHost.classList.toggle('hidden', firstRoundStarter === 'random');
        iconFirstRandom.classList.toggle('hidden', firstRoundStarter !== 'random');
      }
    }

    if (nextRoundStarterRule) {
      if (this.cfgStarterNextGroup) {
        this.cfgStarterNextGroup.querySelectorAll('.cfg-popover-option').forEach((btn) => {
          btn.classList.toggle('selected', btn.dataset.starterNext === nextRoundStarterRule);
        });
      }
      const nextLabels = {
        winner: 'Seguintes: Vencedor',
        next_player: 'Seguintes: Próximo',
        host: 'Seguintes: Host'
      };
      if (this.cfgStarterNextLabel) {
        this.cfgStarterNextLabel.textContent = nextLabels[nextRoundStarterRule] || 'Seguintes: Vencedor';
      }
      ['winner', 'next_player', 'host'].forEach((rule) => {
        const icon = document.getElementById(`cfg-icon-starter-next-${rule}`);
        if (icon) icon.classList.toggle('hidden', rule !== nextRoundStarterRule);
      });
    }

    if (this.btnCreateRoom) {
      this.btnCreateRoom.textContent = 'Criar Sala';
    }
    if (this.btnSetupOpenRoom) {
      this.btnSetupOpenRoom.textContent = 'Criar Sala';
    }
    if (this.createRoomDesc) {
      this.createRoomDesc.textContent = isRoomLocked
        ? 'Crie uma sala e compartilhe o código de 6 dígitos com quem você quer jogar.'
        : 'Sala pública aberta para qualquer jogador entrar sem código pela lista de salas.';
    }
  }

  /** Exibe um emoji flutuando na tela que desaparece no topo */
  spawnFloatingEmoji(emoji) {
    if (!this.floatingEmojisContainer) return;
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;

    // Posição horizontal aleatória no terço central/inferior da tela
    const leftPercent = 20 + Math.random() * 60;
    const bottomPx = 100 + Math.random() * 40;
    el.style.left = `${leftPercent}%`;
    el.style.bottom = `${bottomPx}px`;

    this.floatingEmojisContainer.appendChild(el);
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 2300);
  }

  showRoomSetupView(show) {
    if (this.lobbyHomeView) this.lobbyHomeView.classList.toggle('hidden', show);
    if (this.roomSetupView) this.roomSetupView.classList.toggle('hidden', !show);
  }

  renderLobbyPlayersList(players, hostId, myId, onKick) {
    if (!this.lobbyRoomPlayersList) return;
    this.lobbyRoomPlayersList.innerHTML = '';
    if (!players || players.length === 0) {
      if (this.lobbyRoomPlayersWrap) this.lobbyRoomPlayersWrap.classList.add('hidden');
      return;
    }

    if (this.lobbyRoomPlayersWrap) this.lobbyRoomPlayersWrap.classList.remove('hidden');

    players.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'lobby-player-entry';

      const left = document.createElement('div');
      left.className = 'lobby-player-left';

      const thumb = document.createElement('div');
      thumb.className = 'lobby-player-thumb';
      if (p.avatar && p.avatar.startsWith('data:image')) {
        const img = document.createElement('img');
        img.src = p.avatar;
        img.alt = p.name;
        thumb.appendChild(img);
      } else {
        thumb.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        `;
      }

      const name = document.createElement('span');
      name.className = 'lobby-player-title';
      name.textContent = p.id === myId ? `${p.name} (Você)` : p.name;

      left.appendChild(thumb);
      left.appendChild(name);

      if (p.id === hostId) {
        const badge = document.createElement('span');
        badge.className = 'lobby-player-badge';
        badge.textContent = 'Host';
        left.appendChild(badge);
      }

      row.appendChild(left);

      // Botão kick disponível se quem está visualizando é o Host e o alvo não é ele mesmo
      if (myId === hostId && p.id !== hostId) {
        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'btn-kick-player';
        kickBtn.textContent = 'Expulsar';
        kickBtn.title = `Expulsar ${p.name} da sala`;
        kickBtn.addEventListener('click', () => {
          if (onKick) onKick(p.id);
        });
        row.appendChild(kickBtn);
      }

      this.lobbyRoomPlayersList.appendChild(row);
    });
  }

  updateSoloModeUI(soloMode) {
    const isInfinite = soloMode === 'infinite';
    if (this.btnPractice) {
      this.btnPractice.textContent = isInfinite ? 'Jogar sozinho • Infinito' : 'Jogar sozinho • Clássico';
    }
    if (this.soloModePopover) {
      this.soloModePopover.querySelectorAll('.solo-mode-option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.soloMode === soloMode);
      });
    }
    ['classic', 'infinite'].forEach((m) => {
      const icon = document.getElementById(`icon-solo-${m}`);
      if (icon) icon.classList.toggle('hidden', m !== soloMode);
    });
    if (this.soloModeHint) {
      this.soloModeHint.textContent = isInfinite
        ? 'Modo Infinito: acerte palavras em sequência sem parar e supere seu recorde!'
        : 'Modo Clássico: descubra a palavra secreta em até 6 tentativas.';
    }
  }

  showSoloModePopover(show) {
    if (!this.soloModePopover) return;
    this.soloModePopover.classList.toggle('hidden', !show);
    if (this.btnSoloMode) this.btnSoloMode.setAttribute('aria-expanded', show ? 'true' : 'false');
  }

  renderInfiniteScoreboard(streak, best) {
    this.statusBar.classList.remove('hidden');
    if (this.matchScoreboard) this.matchScoreboard.classList.add('hidden');
    if (this.multiScoreboard) this.multiScoreboard.classList.add('hidden');
    if (this.infiniteScoreboard) this.infiniteScoreboard.classList.remove('hidden');
    if (this.infiniteStreakVal) this.infiniteStreakVal.textContent = streak;
    if (this.infiniteBestVal) this.infiniteBestVal.textContent = best;
  }

  showHelpModal(show) {
    if (show) {
      this.helpModal.classList.remove('hidden');
    } else {
      this.helpModal.classList.add('hidden');
    }
  }

  showWordsHistoryModal(show, history = []) {
    if (!this.wordsHistoryModal) return;
    if (show) {
      this.renderWordsHistoryList(history);
      this.wordsHistoryModal.classList.remove('hidden');
    } else {
      this.wordsHistoryModal.classList.add('hidden');
    }
  }

  renderWordsHistoryList(history = []) {
    if (!this.wordsHistoryList) return;
    if (!Array.isArray(history) || history.length === 0) {
      this.wordsHistoryList.innerHTML = '<div class="words-history-empty">Nenhuma palavra acertada ainda.</div>';
      return;
    }

    this.wordsHistoryList.innerHTML = '';
    history.forEach((item, index) => {
      if (index > 0 && item.matchId !== history[index - 1].matchId) {
        const divider = document.createElement('div');
        divider.className = 'words-history-divider';
        this.wordsHistoryList.appendChild(divider);
      }

      const rowEl = document.createElement('div');
      rowEl.className = 'words-history-row';

      const gridEl = document.createElement('div');
      gridEl.className = 'words-history-grid';
      const letters = String(item.word || '').toUpperCase().split('');
      for (let i = 0; i < this.wordLength; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile correct';
        tile.textContent = letters[i] || '';
        gridEl.appendChild(tile);
      }

      const winnerEl = document.createElement('span');
      winnerEl.className = 'words-history-winner' + (item.isMe ? ' is-me' : '');
      winnerEl.textContent = item.isMe ? 'Você' : (item.winnerName || 'Oponente');

      rowEl.appendChild(gridEl);
      rowEl.appendChild(winnerEl);
      this.wordsHistoryList.appendChild(rowEl);
    });
  }

  showPrivacyModal(show) {
    if (!this.privacyModal) return;
    if (show) {
      this.privacyModal.classList.remove('hidden');
    } else {
      this.privacyModal.classList.add('hidden');
    }
  }

  showGameOverModal({ title, color, subtitle, secretWord, winnerName, attemptsText, secretLabel = 'Palavra Secreta:', playAgainText = 'Continuar Jogando', winnerLabel = 'Vencedor', attemptsLabel = 'Tentativas' }) {
    this.goTitle.textContent = title;
    this.goTitle.style.color = color;
    this.goSubtitle.textContent = subtitle;
    this.goSecretWord.textContent = secretWord;
    // Várias palavras (modos Cruzado/Individual): uma por linha, em fonte menor
    const isMulti = secretWord.includes('\n');
    this.goSecretWord.style.whiteSpace = isMulti ? 'pre-line' : '';
    this.goSecretWord.style.fontSize = isMulti ? '1.05rem' : '';
    this.goSecretWord.style.lineHeight = isMulti ? '1.5' : '';
    if (this.goSecretLabel) this.goSecretLabel.textContent = secretLabel;
    if (this.btnPlayAgain) {
      this.btnPlayAgain.disabled = false;
      this.btnPlayAgain.textContent = playAgainText;
    }
    if (this.goWinnerLabel) this.goWinnerLabel.textContent = winnerLabel;
    if (this.goAttemptsLabel) this.goAttemptsLabel.textContent = attemptsLabel;
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
      const modeLabel = room.mode === 'cross' ? 'Cruzado' : (room.mode === 'individual' ? 'Individual' : 'Normal');
      subSpan.textContent = `Aberta • ${modeLabel} • ${room.count || 1}/${room.max || 2} jogadores`;
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

