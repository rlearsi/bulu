/**
 * TERMO MULTIPLAYER P2P (WebRTC) - Orquestrador Principal
 * Conecta os módulos de Áudio, Perfil, Rede P2P, Cronômetro, Chat, UI do Tabuleiro e Regras.
 */

import { wordsData } from './words.js?v=1.6.6';
import { AudioManager } from './js/audio.js?v=1.6.6';
import { GameRules } from './js/game-rules.js?v=1.6.6';
import { TurnTimer } from './js/timer.js?v=1.6.6';
import { ProfileManager } from './js/profile.js?v=1.6.6';
import { P2PNetwork } from './js/network.js?v=1.6.6';
import { ChatManager } from './js/chat.js?v=1.6.6';
import { BoardUI } from './js/board-ui.js?v=1.6.6';

class TermoMultiplayerGame {
  constructor() {
    this.maxRows = 6;
    this.wordLength = 5;
    this.currentRow = 0;
    this.currentTile = 0;
    this.secretWord = '';
    this.isGameOver = false;
    this.isRevealing = false;

    // Estado Multiplayer / Placar
    this.role = 'solo'; // 'host', 'guest', 'solo'
    this.currentTurnRole = 'host';
    this.oppName = 'Oponente';
    this.oppAvatar = '';
    this.myScore = 0;
    this.oppScore = 0;

    // Matriz de letras no tabuleiro [linha][coluna]
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));

    // Inicialização dos Módulos com Responsabilidade Única
    this.audio = new AudioManager();
    this.rules = new GameRules(wordsData, this.wordLength);

    this.ui = new BoardUI({
      maxRows: this.maxRows,
      wordLength: this.wordLength,
      audio: this.audio,
      onTileClick: (r, c) => this.handleTileClick(r, c),
      onVirtualKeyPress: (k) => this.handleVirtualKeyPress(k)
    });

    this.timer = new TurnTimer(this.ui.turnTimerElement, 180);

    this.profile = new ProfileManager({
      onShowToast: (msg) => this.ui.showToast(msg),
      onProfileUpdated: () => this.syncProfileWithPeer()
    });

    this.network = new P2PNetwork({
      onMessage: (data) => this.handleP2PMessage(data),
      onDisconnect: () => {
        this.ui.showToast('Oponente se desconectou.');
        setTimeout(() => this.resetToLobby(), 2500);
      }
    });

    this.chat = new ChatManager({
      audio: this.audio,
      getContextInfo: () => ({
        myName: this.profile.myName,
        oppName: this.oppName,
        role: this.role,
        isConnected: this.network.isConnected()
      }),
      onSendP2P: (msgData) => this.network.send(msgData)
    });

    this.initEvents();
    this.initBackButtonProtection();
    this.ui.createBoard();
    this.ui.createKeyboard();
    this.refreshHighlight();
  }

  // ==========================================
  // PROTEÇÃO DO BOTÃO VOLTAR (ANDROID / MOBILE)
  // ==========================================
  initBackButtonProtection() {
    this.allowPageExit = false;

    const pushGuardState = () => {
      try {
        window.history.pushState({ termoBackGuard: true }, '', window.location.href);
      } catch (e) {
        // Ignora caso o navegador restrinja manipulação de histórico local
      }
    };

    // Empurra estado inicial para interceptar o gesto/botão "Voltar" no smartphone
    if (!window.history.state || !window.history.state.termoBackGuard) {
      try {
        window.history.replaceState({ termoBackGuard: false }, '', window.location.href);
      } catch (e) {}
      pushGuardState();
    }

    // Garante que o guardião esteja ativo após a primeira interação do usuário
    // (Necessário para contornar a proteção de "sticky activation" do Chrome no Android)
    const ensureHistoryGuard = () => {
      if (!window.history.state || !window.history.state.termoBackGuard) {
        pushGuardState();
      }
    };
    window.addEventListener('pointerdown', ensureHistoryGuard, { passive: true });

    window.addEventListener('popstate', () => {
      if (this.allowPageExit) return;

      // Re-insere o estado imediatamente para impedir que a página feche ou saia do jogo
      pushGuardState();

      this.handleAndroidBackNavigation();
    });
  }

  handleAndroidBackNavigation() {
    // 1. Se o modal de confirmação de saída já estiver aberto, fecha ele
    if (this.ui.exitConfirmModal && !this.ui.exitConfirmModal.classList.contains('hidden')) {
      this.ui.showExitConfirmModal(false);
      return;
    }

    // 2. Se o chat sobreposto estiver aberto, fecha apenas o chat
    if (this.chat && this.chat.isChatOpen) {
      this.chat.toggle(false);
      return;
    }

    // 3. Se o modal de Perfil estiver aberto, fecha apenas o modal de Perfil
    if (this.profile && this.profile.isModalOpen()) {
      this.profile.showModal(false);
      return;
    }

    // 4. Se o modal de Ajuda estiver aberto, fecha apenas o modal de Ajuda
    if (this.ui.helpModal && !this.ui.helpModal.classList.contains('hidden')) {
      this.ui.showHelpModal(false);
      return;
    }

    // 5. Se o modal de Privacidade estiver aberto, fecha apenas o modal de Privacidade
    if (this.ui.privacyModal && !this.ui.privacyModal.classList.contains('hidden')) {
      this.ui.showPrivacyModal(false);
      return;
    }

    // 6. Se estiver em uma partida (tabuleiro visível) ou aguardando na sala criada/conectando
    const isInMatch = this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden');
    const isWaitingHost = this.ui.hostCodeDisplay && !this.ui.hostCodeDisplay.classList.contains('hidden');
    const isJoiningRoom = this.ui.joinStatus && !this.ui.joinStatus.classList.contains('hidden');

    if (isInMatch) {
      this.pendingExitAction = 'lobby';
      this.ui.showExitConfirmModal(true, {
        title: 'Confirmação de saída',
        desc: 'Se você voltar ao início agora, a partida atual será encerrada e a conexão com a sala será finalizada.',
        cancelText: 'Continuar jogando',
        confirmText: 'Voltar ao lobby'
      });
      return;
    }

    if (isWaitingHost || isJoiningRoom) {
      this.pendingExitAction = 'lobby';
      this.ui.showExitConfirmModal(true, {
        title: 'Cancelar conexão da sala?',
        desc: 'Deseja cancelar a sala atual e voltar ao menu inicial?',
        cancelText: 'Continuar aqui',
        confirmText: 'Voltar ao lobby'
      });
      return;
    }

    // 7. Se já estiver no Lobby com tudo fechado, pergunta se deseja sair do jogo
    this.pendingExitAction = 'leave_app';
    this.ui.showExitConfirmModal(true, {
      title: 'Deseja sair do jogo?',
      desc: 'Toque em "Continuar aqui" para permanecer no Termo Duelo.',
      cancelText: 'Continuar aqui',
      confirmText: 'Sair'
    });
  }

  handleConfirmExitAction() {
    this.ui.showExitConfirmModal(false);
    if (this.pendingExitAction === 'lobby') {
      this.resetToLobby();
    } else if (this.pendingExitAction === 'restart_match') {
      this.executeRestartMatch();
    } else if (this.pendingExitAction === 'leave_app') {
      this.allowPageExit = true;
      window.history.go(-2);
    }
    this.pendingExitAction = null;
  }

  requestLeaveMatchConfirmation() {
    const isInMatch = this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden');
    const isWaitingHost = this.ui.hostCodeDisplay && !this.ui.hostCodeDisplay.classList.contains('hidden');
    const isJoiningRoom = this.ui.joinStatus && !this.ui.joinStatus.classList.contains('hidden');

    if (isInMatch || isWaitingHost || isJoiningRoom) {
      this.pendingExitAction = 'lobby';
      this.ui.showExitConfirmModal(true, {
        title: 'Confirmação de saída',
        desc: 'Se você voltar ao início agora, a partida atual será encerrada e a conexão com a sala será finalizada.',
        cancelText: 'Continuar jogando',
        confirmText: 'Voltar ao lobby'
      });
    }
  }

  handleRestartMatch() {
    const isInMatch = this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden');
    if (!isInMatch) return;

    this.pendingExitAction = 'restart_match';
    this.ui.showExitConfirmModal(true, {
      title: 'Reiniciar partida?',
      desc: 'O tabuleiro atual será zerado e uma nova palavra secreta será sorteada.',
      cancelText: 'Continuar jogando',
      confirmText: 'Reiniciar partida'
    });
  }

  executeRestartMatch() {
    const isInMatch = this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden');
    if (!isInMatch) return;

    if (this.role === 'solo') {
      this.secretWord = this.rules.getRandomSecretWord();
      this.resetBoardState();
      this.updateStatusBar();
      this.ui.showToast('Partida reiniciada!');
      return;
    }

    if (this.network.isConnected()) {
      const nextSecret = this.rules.getRandomSecretWord();
      this.secretWord = nextSecret;
      this.currentTurnRole = 'host';
      this.network.send({
        type: 'RESTART_MATCH',
        secretWord: nextSecret,
        startingRole: 'host',
        senderName: this.profile.myName
      });
      this.resetBoardState();
      this.startMultiplayerMatch();
      this.ui.showToast('Partida reiniciada!');
    }
  }

  initEvents() {
    // Ações do Lobby
    this.ui.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.ui.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());
    if (this.ui.inputRoomCode) {
      this.ui.inputRoomCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!this.ui.btnJoinRoom.disabled) {
            this.handleJoinRoom();
          }
        }
      });
    }
    this.ui.btnPractice.addEventListener('click', () => this.startSoloGame());
    this.ui.btnCopyCode.addEventListener('click', () => this.copyRoomCode());

    // Teclado Físico
    window.addEventListener('keydown', (e) => this.handlePhysicalKeyPress(e));

    // Modais e Ações da Partida
    this.ui.btnHelp.addEventListener('click', () => this.ui.showHelpModal(true));
    this.ui.btnCloseHelp.addEventListener('click', () => this.ui.showHelpModal(false));
    this.ui.btnHelpOk.addEventListener('click', () => this.ui.showHelpModal(false));
    this.ui.btnBackLobby.addEventListener('click', () => this.resetToLobby());
    this.ui.btnRestart.addEventListener('click', () => this.handleRestartMatch());
    if (this.ui.btnHome) this.ui.btnHome.addEventListener('click', () => this.requestLeaveMatchConfirmation());
    this.ui.btnPlayAgain.addEventListener('click', () => this.handlePlayAgainRequest());

    if (this.ui.btnPrivacy) this.ui.btnPrivacy.addEventListener('click', () => this.ui.showPrivacyModal(true));
    if (this.ui.btnClosePrivacy) this.ui.btnClosePrivacy.addEventListener('click', () => this.ui.showPrivacyModal(false));
    if (this.ui.btnPrivacyOk) this.ui.btnPrivacyOk.addEventListener('click', () => this.ui.showPrivacyModal(false));

    // Eventos do Modal de Confirmação de Saída
    if (this.ui.btnCloseExit) this.ui.btnCloseExit.addEventListener('click', () => this.ui.showExitConfirmModal(false));
    if (this.ui.btnCancelExit) this.ui.btnCancelExit.addEventListener('click', () => this.ui.showExitConfirmModal(false));
    if (this.ui.btnConfirmExit) this.ui.btnConfirmExit.addEventListener('click', () => this.handleConfirmExitAction());

    // Desbloqueia contexto de áudio no primeiro toque/clique
    const unlockAudio = () => this.audio.getAudioContext();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
  }

  isMyTurn() {
    if (this.role === 'solo') return true;
    return this.role === this.currentTurnRole;
  }

  refreshHighlight() {
    this.ui.updateActiveTileHighlight({
      currentRow: this.currentRow,
      currentTile: this.currentTile,
      isMyTurn: this.isMyTurn(),
      isGameOver: this.isGameOver,
      isRevealing: this.isRevealing
    });
  }

  // ==========================================
  // SALAS E CONEXÃO P2P
  // ==========================================
  handleCreateRoom() {
    this.role = 'host';
    this.ui.btnCreateRoom.disabled = true;
    this.ui.hostCodeDisplay.classList.remove('hidden');
    this.ui.hostStatus.textContent = 'Inicializando rede P2P...';

    const code = this.network.createRoom({
      onOpen: () => {
        this.ui.hostStatus.textContent = 'Aguardando adversário entrar...';
      },
      onError: () => {
        this.ui.hostStatus.textContent = 'Erro ao criar sala. Tente outro código.';
        this.ui.btnCreateRoom.disabled = false;
      }
    });

    this.ui.roomCodeVal.textContent = code;
  }

  handleJoinRoom() {
    const code = this.ui.inputRoomCode.value.trim();
    if (!code || code.length < 6) {
      this.ui.showToast('Digite um código de 6 dígitos');
      return;
    }

    this.role = 'guest';
    this.ui.joinStatus.classList.remove('hidden');
    this.ui.joinStatus.textContent = 'Conectando ao oponente...';
    this.ui.btnJoinRoom.disabled = true;

    this.network.joinRoom(code, {
      onConnected: () => {
        this.ui.joinStatus.textContent = 'Conectado! Iniciando jogo...';
        this.network.send({
          type: 'JOIN_GAME',
          name: this.profile.myName,
          avatar: this.profile.myAvatar
        });
      },
      onError: () => {
        this.ui.joinStatus.textContent = 'Sala não encontrada ou indisponível.';
        this.ui.btnJoinRoom.disabled = false;
      }
    });
  }

  copyRoomCode() {
    if (!this.network.roomCode) return;
    navigator.clipboard.writeText(this.network.roomCode).then(() => {
      this.ui.btnCopyCode.textContent = 'Copiado! ✓';
      setTimeout(() => { this.ui.btnCopyCode.textContent = 'Copiar Código'; }, 2000);
    });
  }

  syncProfileWithPeer() {
    if (this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden')) {
      this.updateStatusBar();
    }
    if (this.role !== 'solo' && this.network.isConnected()) {
      this.network.send({
        type: 'UPDATE_PROFILE',
        name: this.profile.myName,
        avatar: this.profile.myAvatar
      });
    }
  }

  handleP2PMessage(data) {
    switch (data.type) {
      case 'JOIN_GAME':
        if (this.role === 'host') {
          this.oppName = data.name || 'Jogador 2';
          this.oppAvatar = data.avatar || '';
          this.secretWord = this.rules.getRandomSecretWord();
          this.currentTurnRole = 'host';

          this.network.send({
            type: 'START_MATCH',
            hostName: this.profile.myName,
            hostAvatar: this.profile.myAvatar,
            secretWord: this.secretWord,
            startingRole: 'host'
          });

          this.startMultiplayerMatch();
        }
        break;

      case 'START_MATCH':
        if (this.role === 'guest') {
          this.oppName = data.hostName || 'Jogador 1';
          this.oppAvatar = data.hostAvatar || '';
          this.secretWord = data.secretWord;
          this.currentTurnRole = data.startingRole;
          this.startMultiplayerMatch();
        }
        break;

      case 'LIVE_KEYSTROKE':
        this.handleOpponentKeystroke(data.action, data.letter, data.row, data.col);
        break;

      case 'SUBMIT_GUESS':
        this.handleOpponentGuess(data.guess, data.evaluation, data.nextTurnRole, data.isWin, data.winnerRole, data.row);
        break;

      case 'TIME_EXPIRED':
        this.handleTimeExpiredByOpponent(data.timedOutRole, data.nextTurnRole, data.row);
        break;

      case 'SYNC_SCORE':
        if (typeof data.myScore === 'number' && typeof data.oppScore === 'number') {
          this.oppScore = data.myScore;
          this.myScore = data.oppScore;
          this.ui.updateScoreDisplay(this.myScore, this.oppScore);
        }
        break;

      case 'UPDATE_PROFILE':
        if (data.name) this.oppName = data.name;
        if (typeof data.avatar === 'string') this.oppAvatar = data.avatar;
        this.updateStatusBar();
        break;

      case 'RESTART_MATCH':
        if (data.secretWord) {
          this.secretWord = data.secretWord;
          this.currentTurnRole = data.startingRole || 'host';
          this.resetBoardState();
          this.startMultiplayerMatch();
          this.ui.showToast(`${data.senderName || this.oppName} reiniciou a partida!`);
        }
        break;

      case 'CHAT_MESSAGE':
        this.chat.handleIncomingMessage(data);
        break;

      case 'PLAY_AGAIN_REQUEST':
        this.ui.showToast(`${this.oppName} quer jogar novamente!`);
        if (this.role === 'host') {
          this.secretWord = this.rules.getRandomSecretWord();
          this.currentTurnRole = 'host';
          this.network.send({
            type: 'START_MATCH',
            hostName: this.profile.myName,
            hostAvatar: this.profile.myAvatar,
            secretWord: this.secretWord,
            startingRole: 'host'
          });
          this.resetBoardState();
          this.startMultiplayerMatch();
        }
        break;

      default:
        console.log('Mensagem desconhecida:', data);
    }
  }

  // ==========================================
  // FLUXO DE PARTIDAS E TURNOS
  // ==========================================
  startSoloGame() {
    this.role = 'solo';
    this.currentTurnRole = 'solo';
    this.myScore = 0;
    this.oppScore = 0;
    this.oppName = 'Computador';
    this.oppAvatar = '';
    this.secretWord = this.rules.getRandomSecretWord();

    this.resetBoardState();
    this.ui.lobbyScreen.classList.add('hidden');
    this.ui.boardContainer.classList.remove('hidden');
    this.ui.keyboardContainer.classList.remove('hidden');
    this.ui.statusBar.classList.add('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.remove('hidden');

    this.updateStatusBar();
    this.ui.showToast('Jogo Solo iniciado! Boa sorte!');
  }

  startMultiplayerMatch() {
    this.resetBoardState();
    this.ui.lobbyScreen.classList.add('hidden');
    this.ui.boardContainer.classList.remove('hidden');
    this.ui.keyboardContainer.classList.remove('hidden');
    this.ui.statusBar.classList.remove('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.remove('hidden');

    this.updateStatusBar();
  }

  resetBoardState() {
    this.timer.stop();
    this.currentRow = 0;
    this.currentTile = 0;
    this.isGameOver = false;
    this.isRevealing = false;
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));

    this.ui.createBoard();
    this.ui.createKeyboard();
    this.ui.gameoverModal.classList.add('hidden');
    this.refreshHighlight();
  }

  updateStatusBar() {
    if (this.role === 'solo') {
      this.timer.hide();
      this.ui.statusBar.classList.add('hidden');
      this.ui.keyboardElement.classList.remove('locked');
      this.refreshHighlight();
      return;
    }

    this.ui.renderScoreboard({
      role: this.role,
      myName: this.profile.myName,
      myAvatar: this.profile.myAvatar,
      oppName: this.oppName,
      oppAvatar: this.oppAvatar,
      myScore: this.myScore,
      oppScore: this.oppScore,
      isMyTurn: this.isMyTurn()
    });

    this.refreshHighlight();
    this.timer.start({
      isGameOver: this.isGameOver,
      role: this.role,
      isMyTurnFn: () => this.isMyTurn(),
      onTimeout: () => this.handleTurnTimeout()
    });
  }

  handleTurnTimeout() {
    this.timer.stop();
    if (this.isGameOver || this.isRevealing || this.role === 'solo') return;

    if (this.isMyTurn()) {
      const nextTurnRole = this.role === 'host' ? 'guest' : 'host';
      this.ui.showToast('Tempo esgotado! Vez passada para o oponente.');
      this.clearUnsubmittedRow(this.currentRow);

      this.network.send({
        type: 'TIME_EXPIRED',
        timedOutRole: this.role,
        nextTurnRole: nextTurnRole,
        row: this.currentRow
      });

      this.currentTurnRole = nextTurnRole;
      this.updateStatusBar();
    }
  }

  handleTimeExpiredByOpponent(timedOutRole, nextTurnRole, row) {
    this.timer.stop();
    if (typeof row === 'number' && row >= 0 && row < this.maxRows) {
      this.currentRow = row;
    }
    this.clearUnsubmittedRow(this.currentRow);
    this.ui.showToast(`Tempo de ${this.oppName} esgotou! Sua vez.`);
    this.currentTurnRole = nextTurnRole;
    this.updateStatusBar();
  }

  clearUnsubmittedRow(row) {
    if (row < 0 || row >= this.maxRows) return;
    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[row][c] = '';
      const tile = this.ui.getTileElement(row, c);
      if (tile && !tile.classList.contains('flip')) {
        tile.textContent = '';
        tile.classList.remove('filled', 'opponent-typing', 'active-cursor');
      }
    }
    this.currentTile = 0;
  }

  // ==========================================
  // NAVEGAÇÃO DO CURSOR E ENTRADA DE DADOS
  // ==========================================
  handleTileClick(r, c) {
    if (this.isGameOver || this.isRevealing || !this.isMyTurn()) return;
    if (r !== this.currentRow) return;

    this.currentTile = Math.max(0, Math.min(this.wordLength - 1, c));
    this.refreshHighlight();
  }

  moveToNextEmptyTile() {
    const rowLetters = this.boardMatrix[this.currentRow];
    let nextEmpty = -1;
    for (let i = this.currentTile + 1; i < this.wordLength; i++) {
      if (!rowLetters[i]) {
        nextEmpty = i;
        break;
      }
    }
    if (nextEmpty === -1) {
      for (let i = 0; i < this.wordLength; i++) {
        if (!rowLetters[i]) {
          nextEmpty = i;
          break;
        }
      }
    }

    if (nextEmpty !== -1) {
      this.currentTile = nextEmpty;
      this.refreshHighlight();
    }
  }

  moveCursorLeft() {
    if (this.currentTile > 0) {
      this.currentTile--;
      this.refreshHighlight();
    }
  }

  moveCursorRight() {
    if (this.currentTile < this.wordLength - 1) {
      this.currentTile++;
      this.refreshHighlight();
    }
  }

  handlePhysicalKeyPress(e) {
    if (this.isGameOver || this.isRevealing || this.ui.lobbyScreen.offsetParent !== null) return;
    if (this.ui.helpModal.offsetParent !== null || this.ui.gameoverModal.offsetParent !== null) return;
    if (this.profile.isModalOpen()) return;
    if (this.ui.privacyModal && this.ui.privacyModal.offsetParent !== null) return;
    if (this.ui.exitConfirmModal && this.ui.exitConfirmModal.offsetParent !== null) return;

    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (!this.isMyTurn()) {
      this.ui.showToast('Aguarde a vez do seu oponente!');
      return;
    }

    const key = e.key.toUpperCase();
    if (key === 'ENTER') {
      this.submitCurrentRow();
    } else if (key === 'BACKSPACE') {
      this.deleteLetter();
    } else if (key === 'ARROWLEFT') {
      e.preventDefault();
      this.moveCursorLeft();
    } else if (key === 'ARROWRIGHT') {
      e.preventDefault();
      this.moveCursorRight();
    } else if (key === ' ' || key === 'SPACE' || e.code === 'Space') {
      e.preventDefault();
      this.moveToNextEmptyTile();
    } else if (/^[A-Z]$/.test(key)) {
      this.addLetter(key);
    }
  }

  handleVirtualKeyPress(key) {
    if (this.isGameOver || this.isRevealing) return;
    if (!this.isMyTurn()) {
      this.ui.showToast('Aguarde a vez do seu oponente!');
      return;
    }

    if (key === 'ENTER') {
      this.submitCurrentRow();
    } else if (key === 'BACKSPACE') {
      this.deleteLetter();
    } else {
      this.addLetter(key);
    }
  }

  addLetter(letter) {
    if (this.isRevealing || this.currentRow >= this.maxRows) return;
    const col = Math.min(this.currentTile, this.wordLength - 1);
    if (col < 0 || col >= this.wordLength) return;

    this.boardMatrix[this.currentRow][col] = letter;
    const tileEl = this.ui.getTileElement(this.currentRow, col);
    if (tileEl) {
      tileEl.textContent = letter;
      tileEl.classList.remove('opponent-typing');
      tileEl.classList.add('filled');
    }

    if (this.currentTile < this.wordLength - 1) {
      this.currentTile++;
    } else {
      this.currentTile = this.wordLength;
    }
    this.refreshHighlight();

    if (this.role !== 'solo') {
      this.network.send({
        type: 'LIVE_KEYSTROKE',
        action: 'ADD',
        letter: letter,
        row: this.currentRow,
        col: col
      });
    }
  }

  deleteLetter() {
    if (this.isRevealing || this.currentRow >= this.maxRows) return;

    let col = this.currentTile;
    if (col >= this.wordLength) {
      col = this.wordLength - 1;
      this.currentTile = col;
    } else if (this.boardMatrix[this.currentRow][col] === '') {
      if (col > 0) {
        col--;
        this.currentTile = col;
      }
    }

    this.boardMatrix[this.currentRow][col] = '';
    const tileEl = this.ui.getTileElement(this.currentRow, col);
    if (tileEl) {
      tileEl.textContent = '';
      tileEl.classList.remove('filled', 'opponent-typing');
    }
    this.refreshHighlight();

    if (this.role !== 'solo') {
      this.network.send({
        type: 'LIVE_KEYSTROKE',
        action: 'DELETE',
        row: this.currentRow,
        col: col
      });
    }
  }

  handleOpponentKeystroke(action, letter, row, col) {
    const targetRow = row !== undefined ? row : this.currentRow;
    const targetCol = col !== undefined ? col : this.currentTile;

    if (action === 'ADD' && letter) {
      if (targetCol >= 0 && targetCol < this.wordLength && targetRow < this.maxRows) {
        this.boardMatrix[targetRow][targetCol] = letter;
        const tileEl = this.ui.getTileElement(targetRow, targetCol);
        if (tileEl) {
          tileEl.textContent = letter;
          tileEl.classList.add('filled', 'opponent-typing');
        }
        this.currentTile = targetCol + 1;
      }
    } else if (action === 'DELETE') {
      if (targetCol >= 0 && targetCol < this.wordLength && targetRow < this.maxRows) {
        this.boardMatrix[targetRow][targetCol] = '';
        const tileEl = this.ui.getTileElement(targetRow, targetCol);
        if (tileEl) {
          tileEl.textContent = '';
          tileEl.classList.remove('filled', 'opponent-typing');
        }
        this.currentTile = targetCol;
      }
    }
  }

  // ==========================================
  // SUBMISSÃO DE PALPITES E FIM DE PARTIDA
  // ==========================================
  submitCurrentRow() {
    if (this.isRevealing || this.isGameOver || this.currentRow >= this.maxRows) return;

    const letters = this.boardMatrix[this.currentRow];
    const isComplete = letters.every(l => l && l.trim().length === 1);
    if (!isComplete) {
      this.ui.shakeRow(this.currentRow);
      this.ui.showToast('Palavra incompleta');
      return;
    }

    const guess = letters.join('');

    if (!this.rules.isValidWord(guess)) {
      this.ui.shakeRow(this.currentRow);
      this.ui.showToast('Essa palavra não existe em nosso banco de dados');
      return;
    }

    const evaluation = this.rules.evaluateGuess(guess, this.secretWord);
    const isWin = evaluation.every(s => s === 'correct');
    const nextTurnRole = this.role === 'host' ? 'guest' : 'host';

    this.timer.stop();

    this.isRevealing = true;
    this.ui.keyboardElement.classList.add('locked');
    this.refreshHighlight();

    const submittedRow = this.currentRow;
    this.ui.animateRowReveal(submittedRow, guess, evaluation, () => {
      this.isRevealing = false;
      if (isWin) {
        this.triggerWin(this.profile.myName, true);
        if (this.role !== 'solo') {
          this.network.send({
            type: 'SUBMIT_GUESS',
            guess: guess,
            evaluation: evaluation,
            nextTurnRole: nextTurnRole,
            isWin: true,
            winnerRole: this.role,
            row: submittedRow
          });
        }
      } else {
        this.currentRow = submittedRow + 1;
        this.currentTile = 0;

        if (this.currentRow >= this.maxRows) {
          this.triggerGameOverLoss();
          if (this.role !== 'solo') {
            this.network.send({
              type: 'SUBMIT_GUESS',
              guess: guess,
              evaluation: evaluation,
              nextTurnRole: nextTurnRole,
              isWin: false,
              winnerRole: null,
              row: submittedRow
            });
          }
        } else {
          if (this.role !== 'solo') {
            this.currentTurnRole = nextTurnRole;
            this.network.send({
              type: 'SUBMIT_GUESS',
              guess: guess,
              evaluation: evaluation,
              nextTurnRole: nextTurnRole,
              isWin: false,
              winnerRole: null,
              row: submittedRow
            });
          }
          this.updateStatusBar();
        }
      }
    });
  }

  handleOpponentGuess(guess, evaluation, nextTurnRole, isWin, winnerRole, row) {
    this.timer.stop();
    this.isRevealing = true;
    this.refreshHighlight();
    const opponentRow = (typeof row === 'number' && row >= 0 && row < this.maxRows) ? row : this.currentRow;
    this.currentRow = opponentRow;
    const rowEl = this.ui.getRowElement(opponentRow);
    if (rowEl) {
      rowEl.classList.add('opponent-row');
    }

    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[opponentRow][c] = guess[c];
      const tile = this.ui.getTileElement(opponentRow, c);
      tile.textContent = guess[c];
      tile.classList.add('filled');
    }

    this.ui.animateRowReveal(opponentRow, guess, evaluation, () => {
      this.isRevealing = false;
      if (isWin) {
        this.triggerWin(this.oppName, false);
      } else {
        this.currentRow = opponentRow + 1;
        this.currentTile = 0;

        if (this.currentRow >= this.maxRows) {
          this.triggerGameOverLoss();
        } else {
          this.currentTurnRole = nextTurnRole;
          this.updateStatusBar();
        }
      }
    });
  }

  triggerWin(winnerName, isMe) {
    this.timer.stop();
    this.isGameOver = true;

    if (isMe) {
      this.myScore++;
    } else {
      this.oppScore++;
    }
    this.ui.updateScoreDisplay(this.myScore, this.oppScore);

    if (window.confetti && isMe) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    setTimeout(() => {
      this.ui.showGameOverModal({
        title: isMe ? 'VITÓRIA!' : 'DERROTA!',
        color: isMe ? 'var(--color-correct)' : 'var(--color-present)',
        subtitle: isMe ? 'Você acertou a palavra secreta!' : `${winnerName} acertou a palavra primeiro!`,
        secretWord: this.secretWord,
        winnerName: winnerName,
        attemptsText: `${this.currentRow + 1}/${this.maxRows}`
      });
    }, 1800);
  }

  triggerGameOverLoss() {
    this.timer.stop();
    this.isGameOver = true;
    setTimeout(() => {
      this.ui.showGameOverModal({
        title: 'FIM DE JOGO',
        color: '#fff',
        subtitle: 'Ninguém acertou em 6 tentativas.',
        secretWord: this.secretWord,
        winnerName: 'Empate',
        attemptsText: `6/${this.maxRows}`
      });
    }, 1200);
  }

  handlePlayAgainRequest() {
    if (this.role === 'solo') {
      this.startSoloGame();
    } else {
      this.network.send({ type: 'PLAY_AGAIN_REQUEST' });
      this.ui.showToast('Pedido enviado ao oponente...');
      if (this.role === 'host') {
        this.secretWord = this.rules.getRandomSecretWord();
        this.currentTurnRole = 'host';
        this.network.send({
          type: 'START_MATCH',
          hostName: this.profile.myName,
          hostAvatar: this.profile.myAvatar,
          secretWord: this.secretWord,
          startingRole: 'host'
        });
        this.resetBoardState();
        this.startMultiplayerMatch();
      }
    }
  }

  resetToLobby() {
    this.timer.stop();
    this.isGameOver = true;
    this.myScore = 0;
    this.oppScore = 0;
    this.ui.updateScoreDisplay(this.myScore, this.oppScore);
    this.network.destroy();

    this.role = 'solo';

    this.ui.gameoverModal.classList.add('hidden');
    if (this.ui.privacyModal) this.ui.privacyModal.classList.add('hidden');
    if (this.ui.exitConfirmModal) this.ui.exitConfirmModal.classList.add('hidden');
    this.ui.helpModal.classList.add('hidden');
    this.ui.boardContainer.classList.add('hidden');
    this.ui.keyboardContainer.classList.add('hidden');
    this.ui.statusBar.classList.add('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.add('hidden');
    this.ui.hostCodeDisplay.classList.add('hidden');
    this.ui.joinStatus.classList.add('hidden');
    this.ui.btnCreateRoom.disabled = false;
    this.ui.btnJoinRoom.disabled = false;

    this.chat.reset();

    this.ui.lobbyScreen.classList.remove('hidden');
  }
}

// Inicializa o jogo ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  window.termoGame = new TermoMultiplayerGame();
});
