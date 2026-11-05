/**
 * TERMO MULTIPLAYER P2P (WebRTC) - Orquestrador Principal
 * Conecta os módulos de Áudio, Perfil, Rede P2P, Cronômetro, Chat, UI do Tabuleiro e Regras.
 */

import { wordsData, secretWords } from './words.js?v=1.11.0';
import { AudioManager } from './js/audio.js?v=1.11.0';
import { GameRules } from './js/game-rules.js?v=1.11.0';
import { TurnTimer } from './js/timer.js?v=1.11.0';
import { ProfileManager } from './js/profile.js?v=1.11.0';
import { P2PNetwork } from './js/network.js?v=1.11.0';
import { ChatManager } from './js/chat.js?v=1.11.0';
import { BoardUI } from './js/board-ui.js?v=1.11.0';
import { MultiBoardLayout } from './js/multi-board.js?v=1.11.0';
import { VoiceManager } from './js/voice.js?v=1.11.0';

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
    this.isRoomLocked = true; // true = Sala Privada (com código, padrão), false = Sala Pública (sem código)
    this.maxPlayers = 2; // Máximo de jogadores na sala (2 a 4)
    this.myId = '';
    // Jogadores na ordem de entrada na sala (o primeiro é sempre o host): { id, name, avatar, score }
    this.players = [];
    this.currentTurnId = '';
    this.roundStarterId = '';
    this.lastWinnerId = null;
    this.matchStarted = false;
    this.readyPlayers = new Set();
    this.hostMigrationTimer = null;

    // Modos de jogo: 'normal' (grade compartilhada), 'cross' (Cruzado) e 'individual' (corrida simultânea)
    this.gameMode = 'normal';
    this.revealLetters = true; // Por padrão sempre mostra letras; nos modos multigrade pode alternar para cores
    this.showOpponentSelection = true; // Mostrar onde o oponente está selecionando
    this.secrets = {}; // id do jogador -> palavra secreta da sua grade (modos cross/individual)
    this.progress = {}; // Individual: id -> { rows, done }
    this.myDone = false; // Individual: já venceu ou esgotou as tentativas
    this.winnerDecided = false; // Individual (host): vencedor já definido
    this.countdownTimer = null;
    this.opponentCursor = null; // { row, col } do oponente ativo

    // Modo Solo: 'classic' (1 palavra em 6 tentativas) ou 'infinite' (sequência contínua)
    this.soloMode = 'classic';
    this.infiniteStreak = 0;
    this.infiniteBest = Number(localStorage.getItem('termo_infinite_best') || 0);

    // Histórico de palavras acertadas (armazenado localmente em todas as partidas)
    this.matchSessionId = Date.now();
    this.guessedWordsHistory = this.loadGuessedWordsHistory();

    // Matriz de letras no tabuleiro [linha][coluna]
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));

    // Inicialização dos Módulos com Responsabilidade Única
    this.audio = new AudioManager();
    this.rules = new GameRules(wordsData, this.wordLength, secretWords);

    this.ui = new BoardUI({
      maxRows: this.maxRows,
      wordLength: this.wordLength,
      audio: this.audio,
      onTileClick: (r, c) => this.handleTileClick(r, c),
      onVirtualKeyPress: (k) => this.handleVirtualKeyPress(k)
    });

    this.mm = new MultiBoardLayout({ ui: this.ui, wordLength: this.wordLength });

    this.timer = new TurnTimer(this.ui.turnTimerElement, 60);

    this.profile = new ProfileManager({
      onShowToast: (msg) => this.ui.showToast(msg),
      onProfileUpdated: () => this.syncProfileWithPeer()
    });

    this.network = new P2PNetwork({
      onMessage: (data, fromId) => this.handleP2PMessage(data, fromId),
      onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
      onHostLost: (hostId) => this.handleHostLost(hostId),
      onJoinRejected: () => this.handleJoinRejected(),
      acceptJoin: (data, peerId) => this.acceptJoin(data, peerId),
      onIncomingCall: (call) => this.voice && this.voice.handleIncomingPeerCall(call),
      getRoomInfo: () => ({
        joinable: this.role === 'host' && !this.matchStarted && this.players.length < this.maxPlayers,
        hostName: this.profile.myName,
        hostAvatar: this.profile.myAvatar,
        count: this.players.length,
        max: this.maxPlayers,
        mode: this.gameMode
      })
    });

    this.chat = new ChatManager({
      audio: this.audio,
      onShowToast: (msg) => this.ui.showToast(msg),
      getContextInfo: () => ({
        myName: this.profile.myName,
        oppName: this.oppName,
        role: this.role,
        isConnected: this.network.isConnected()
      }),
      onSendP2P: (msgData) => this.network.send(msgData)
    });

    this.voice = new VoiceManager({
      audio: this.audio,
      onShowToast: (msg) => this.ui.showToast(msg),
      getContextInfo: () => ({
        myName: this.profile.myName,
        oppName: this.oppName,
        role: this.role,
        isInMatch: this.matchStarted && !this.isGameOver,
        isConnected: this.network.isConnected(),
        myPeerId: this.myId,
        oppPeerId: this.getOpponentPeerId()
      }),
      onSendP2P: (msgData) => this.network.send(msgData),
      getPeerInstance: () => this.network.peer
    });

    this.initEvents();
    this.initBackButtonProtection();
    this.ui.createBoard();
    this.ui.createKeyboard();
    this.refreshHighlight();
  }

  // ==========================================
  // JOGADORES E ORDEM DE TURNOS
  // ==========================================
  get hostId() {
    return this.players.length ? this.players[0].id : '';
  }

  /** Modo efetivo da partida: o treino solo é sempre Normal. */
  get mode() {
    return this.role === 'solo' ? 'normal' : this.gameMode;
  }

  /**
   * Linhas da grade: 6 + 1 por jogador extra (2 = 7, 3 = 8, 4 = 9) nos modos Normal e Cruzado.
   * Solo e Individual (cada um com sua grade, sem turnos) mantêm 6 linhas.
   */
  getRowsForMode() {
    if (this.role === 'solo' || this.mode === 'individual') return 6;
    return 6 + Math.max(1, Math.min(4, this.players.length)) - 1;
  }

  /** Nome(s) dos oponentes (usado pelo chat e por mensagens de toast). */
  get oppName() {
    const opps = this.players.filter(p => p.id !== this.myId);
    if (this.role === 'solo') return 'Computador';
    if (opps.length === 0) return 'Oponente';
    return opps.map(p => p.name).join(', ');
  }

  getOpponentPeerId() {
    const opp = this.players.find(p => p.id !== this.myId);
    return opp ? opp.id : null;
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id) || null;
  }

  getPlayerName(id) {
    const p = this.getPlayer(id);
    return p ? p.name : 'Jogador';
  }

  /** Próximo jogador na fila (ordem de entrada na sala), de forma circular. */
  nextPlayerId(afterId) {
    if (this.players.length === 0) return '';
    const idx = this.players.findIndex(p => p.id === afterId);
    if (idx === -1) return this.players[0].id;
    return this.players[(idx + 1) % this.players.length].id;
  }

  makeSelfPlayer() {
    return { id: this.myId, name: this.profile.myName, avatar: this.profile.myAvatar, score: 0 };
  }

  /** Mescla lista de jogadores recebida do host, mantendo meu perfil atualizado localmente. */
  applyPlayersList(list) {
    if (!Array.isArray(list)) return;
    this.players = list.map(p => ({
      id: p.id,
      name: p.name || 'Jogador',
      avatar: p.avatar || '',
      score: typeof p.score === 'number' ? p.score : 0
    }));
  }

  // ==========================================
  // HISTÓRICO DE PALAVRAS ACERTADAS (LOCALSTORAGE)
  // ==========================================
  loadGuessedWordsHistory() {
    try {
      const raw = localStorage.getItem('termo_match_guessed_words');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  saveGuessedWordsHistory() {
    try {
      localStorage.setItem('termo_match_guessed_words', JSON.stringify(this.guessedWordsHistory));
    } catch (e) {}
  }

  startNewMatchHistoryGroup() {
    this.matchSessionId = Date.now();
  }

  recordGuessedWord(word, isMe, winnerName) {
    if (!word) return;
    this.guessedWordsHistory.unshift({
      word: String(word).toUpperCase(),
      isMe: Boolean(isMe),
      winnerName: isMe ? 'Você' : (winnerName || 'Oponente'),
      matchId: this.matchSessionId
    });
    this.saveGuessedWordsHistory();
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

    // 4b. Se o modal de Palavras Acertadas estiver aberto, fecha apenas ele
    if (this.ui.wordsHistoryModal && !this.ui.wordsHistoryModal.classList.contains('hidden')) {
      this.ui.showWordsHistoryModal(false);
      return;
    }

    // 5. Se o modal de Privacidade estiver aberto, fecha apenas o modal de Privacidade
    if (this.ui.privacyModal && !this.ui.privacyModal.classList.contains('hidden')) {
      this.ui.showPrivacyModal(false);
      return;
    }

    // 5b. Se o modal de Salas Públicas estiver aberto, fecha ele
    if (this.ui.publicRoomsModal && !this.ui.publicRoomsModal.classList.contains('hidden')) {
      this.closePublicRoomsModal();
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

    // 6b. Se estiver na tela de configurações de sala (sem sala criada ainda), volta para o menu inicial do lobby
    if (this.ui.roomSetupView && !this.ui.roomSetupView.classList.contains('hidden')) {
      this.ui.showRoomSetupView(false);
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
      this.startSoloGame();
      this.ui.showToast('Partida reiniciada!');
      return;
    }

    if (this.mode !== 'normal') {
      if (this.role === 'host') {
        this.startNewRound(this.roundStarterId || this.hostId);
        this.ui.showToast('Partida reiniciada!');
      } else if (this.network.isConnected()) {
        this.network.send({ type: 'RESTART_REQUEST', from: this.myId });
        this.ui.showToast('Pedido de reinício enviado ao host...');
      }
      return;
    }

    if (this.network.isConnected()) {
      const nextSecret = this.rules.getRandomSecretWord();
      const startingId = this.roundStarterId || this.hostId;
      this.secretWord = nextSecret;
      this.currentTurnId = startingId;
      this.network.send({
        type: 'RESTART_MATCH',
        from: this.myId,
        secretWord: nextSecret,
        startingId: startingId,
        senderName: this.profile.myName
      });
      this.resetBoardState();
      this.startMultiplayerMatch();
      this.ui.showToast('Partida reiniciada!');
    }
  }

  initEvents() {
    // Ações do Lobby
    this.ui.updateMaxPlayersUI(this.maxPlayers);
    this.ui.updateGameModeUI(this.gameMode, this.revealLetters);
    this.ui.updateRoomConfigUI({
      isRoomLocked: this.isRoomLocked,
      showOpponentSelection: this.showOpponentSelection
    });

    if (this.ui.btnRoomConfigToggle) {
      this.ui.btnRoomConfigToggle.addEventListener('click', () => {
        this.openRoomSetupScreen(false);
      });
    }

    if (this.ui.btnBackFromSetup) {
      this.ui.btnBackFromSetup.addEventListener('click', () => {
        if (this.isHostWaitingInLobby()) {
          this.resetToLobby();
        } else {
          this.ui.showRoomSetupView(false);
        }
      });
    }

    if (this.ui.btnSetupOpenRoom) {
      this.ui.btnSetupOpenRoom.addEventListener('click', () => this.handleCreateRoom());
    }

    if (this.ui.btnCfgModeDropdown) {
      this.ui.btnCfgModeDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !this.ui.cfgModePopover.classList.contains('hidden');
        this.closeAllConfigPopovers();
        if (!isOpen) {
          this.ui.cfgModePopover.classList.remove('hidden');
          this.ui.btnCfgModeDropdown.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (this.ui.btnCfgPlayersDropdown) {
      this.ui.btnCfgPlayersDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !this.ui.cfgPlayersPopover.classList.contains('hidden');
        this.closeAllConfigPopovers();
        if (!isOpen) {
          this.ui.cfgPlayersPopover.classList.remove('hidden');
          this.ui.btnCfgPlayersDropdown.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (this.ui.cfgPlayersGroup) {
      this.ui.cfgPlayersGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.max-players-option, .cfg-toggle-btn');
        if (!btn) return;
        this.setMaxPlayers(Number(btn.dataset.value));
        this.closeAllConfigPopovers();
      });
    }

    if (this.ui.cfgModeGroup) {
      this.ui.cfgModeGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-popover-option, .cfg-toggle-btn');
        if (!btn) return;
        this.setGameMode(btn.dataset.mode);
        this.closeAllConfigPopovers();
      });
    }

    document.addEventListener('click', () => {
      this.closeAllConfigPopovers();
    });

    if (this.ui.btnCfgCursorDropdown) {
      this.ui.btnCfgCursorDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !this.ui.cfgCursorPopover.classList.contains('hidden');
        this.closeAllConfigPopovers();
        if (!isOpen) {
          this.ui.cfgCursorPopover.classList.remove('hidden');
          this.ui.btnCfgCursorDropdown.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (this.ui.btnCfgRevealDropdown) {
      this.ui.btnCfgRevealDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.gameMode === 'normal') return;
        const isOpen = !this.ui.cfgRevealPopover.classList.contains('hidden');
        this.closeAllConfigPopovers();
        if (!isOpen) {
          this.ui.cfgRevealPopover.classList.remove('hidden');
          this.ui.btnCfgRevealDropdown.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (this.ui.cfgCursorGroup) {
      this.ui.cfgCursorGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-popover-option, .cfg-toggle-btn');
        if (!btn) return;
        this.showOpponentSelection = btn.dataset.cursor === 'true';
        this.ui.updateRoomConfigUI({
          isRoomLocked: this.isRoomLocked,
          showOpponentSelection: this.showOpponentSelection
        });
        this.closeAllConfigPopovers();
      });
    }

    if (this.ui.cfgRevealGroup) {
      this.ui.cfgRevealGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-popover-option, .cfg-toggle-btn');
        if (!btn) return;
        this.revealLetters = btn.dataset.reveal === 'true';
        this.ui.updateGameModeUI(this.gameMode, this.revealLetters);
        this.closeAllConfigPopovers();
      });
    }

    if (this.ui.cfgPrivacyGroup) {
      this.ui.cfgPrivacyGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-toggle-btn');
        if (!btn) return;
        const nextLocked = btn.dataset.locked === 'true';
        const changed = this.isRoomLocked !== nextLocked;
        this.isRoomLocked = nextLocked;
        this.ui.updateRoomConfigUI({
          isRoomLocked: this.isRoomLocked,
          showOpponentSelection: this.showOpponentSelection
        });
        if (changed && this.isHostWaitingInLobby() && !this.network.isConnected()) {
          this.handleCreateRoom();
        }
      });
    }

    this.ui.btnCreateRoom.addEventListener('click', () => {
      this.openRoomSetupScreen(true);
    });

    if (this.ui.btnCancelRoom) {
      this.ui.btnCancelRoom.addEventListener('click', () => this.resetToLobby());
    }

    this.ui.updateSoloModeUI(this.soloMode);
    if (this.ui.btnSoloMode) {
      this.ui.btnSoloMode.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !this.ui.soloModePopover.classList.contains('hidden');
        this.ui.showSoloModePopover(!isOpen);
      });
    }
    if (this.ui.soloModePopover) {
      this.ui.soloModePopover.addEventListener('click', (e) => {
        e.stopPropagation();
        const opt = e.target.closest('.solo-mode-option');
        if (!opt) return;
        this.setSoloMode(opt.dataset.soloMode);
        this.ui.showSoloModePopover(false);
      });
      document.addEventListener('click', () => this.ui.showSoloModePopover(false));
    }

    if (this.ui.btnStartMatch) {
      this.ui.btnStartMatch.addEventListener('click', () => {
        if (this.role === 'host' && !this.matchStarted && this.players.length >= 2) {
          this.triggerCountdownAndStart();
        }
      });
    }
    this.ui.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());
    if (this.ui.btnJoinPublicRoom) {
      this.ui.btnJoinPublicRoom.addEventListener('click', () => this.openPublicRoomsModal());
    }
    if (this.ui.btnClosePublicRooms) {
      this.ui.btnClosePublicRooms.addEventListener('click', () => this.closePublicRoomsModal());
    }
    if (this.ui.btnRefreshPublicRooms) {
      this.ui.btnRefreshPublicRooms.addEventListener('click', () => this.refreshPublicRoomsList());
    }
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

    // Libera imediatamente o ID no PeerJS ao atualizar a página (F5) ou fechar a aba
    const cleanupNetworkOnUnload = () => {
      if (this.network) this.network.destroy();
    };
    window.addEventListener('beforeunload', cleanupNetworkOnUnload);
    window.addEventListener('pagehide', cleanupNetworkOnUnload);

    // Teclado Físico
    window.addEventListener('keydown', (e) => this.handlePhysicalKeyPress(e));

    // Modais e Ações da Partida
    this.ui.btnHelp.addEventListener('click', () => this.ui.showHelpModal(true));
    this.ui.btnCloseHelp.addEventListener('click', () => this.ui.showHelpModal(false));
    this.ui.btnHelpOk.addEventListener('click', () => this.ui.showHelpModal(false));
    if (this.ui.btnWordsHistory) {
      this.ui.btnWordsHistory.addEventListener('click', () => this.ui.showWordsHistoryModal(true, this.guessedWordsHistory));
    }
    if (this.ui.btnCloseWordsHistory) {
      this.ui.btnCloseWordsHistory.addEventListener('click', () => this.ui.showWordsHistoryModal(false));
    }
    if (this.ui.btnWordsHistoryOk) {
      this.ui.btnWordsHistoryOk.addEventListener('click', () => this.ui.showWordsHistoryModal(false));
    }
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
    // Individual: sem turnos, todos jogam ao mesmo tempo até vencer ou esgotar as tentativas
    if (this.mode === 'individual') return Boolean(this.myId) && !this.myDone;
    return Boolean(this.myId) && this.currentTurnId === this.myId;
  }

  refreshHighlight() {
    const cursor = this.showOpponentSelection ? this.opponentCursor : null;
    this.ui.updateActiveTileHighlight({
      currentRow: this.currentRow,
      currentTile: this.currentTile,
      isMyTurn: this.isMyTurn(),
      isGameOver: this.isGameOver,
      isRevealing: this.isRevealing,
      opponentCursor: this.mode !== 'individual' ? cursor : null
    });
    if (this.mm && this.mm.isMounted) {
      this.mm.setOpponentCursor(!this.isGameOver ? cursor : null, this.mode);
    }
  }

  // ==========================================
  // SALAS E CONEXÃO P2P
  // ==========================================
  isHostWaitingInLobby() {
    return this.role === 'host' && !this.matchStarted &&
      this.ui.hostCodeDisplay && !this.ui.hostCodeDisplay.classList.contains('hidden');
  }

  setGameMode(mode) {
    if (!['normal', 'cross', 'individual'].includes(mode)) return;
    this.gameMode = mode;
    this.ui.updateGameModeUI(this.gameMode, this.revealLetters);
  }

  setSoloMode(soloMode) {
    if (!['classic', 'infinite'].includes(soloMode)) return;
    this.soloMode = soloMode;
    this.ui.updateSoloModeUI(this.soloMode);
  }

  /** Mensagem exibida ao tentar jogar quando não é possível digitar. */
  notMyTurnMessage() {
    return this.mode === 'individual' ? 'Você já terminou. Aguarde os demais jogadores!' : 'Aguarde a vez do seu oponente!';
  }

  setMaxPlayers(value) {
    const v = Math.max(2, Math.min(4, Number(value) || 2));
    const isWaitingHost = this.isHostWaitingInLobby();
    if (isWaitingHost && v < this.players.length) {
      this.ui.showToast(`Já há ${this.players.length} jogadores na sala.`);
      return;
    }
    this.maxPlayers = v;
    this.ui.updateMaxPlayersUI(v);

    if (isWaitingHost && this.players.length > 0) {
      this.broadcastLobbyUpdate();
      this.updateHostLobbyStatus();
    }
  }

  closeAllConfigPopovers() {
    if (this.ui.cfgModePopover) this.ui.cfgModePopover.classList.add('hidden');
    if (this.ui.cfgPlayersPopover) this.ui.cfgPlayersPopover.classList.add('hidden');
    if (this.ui.cfgCursorPopover) this.ui.cfgCursorPopover.classList.add('hidden');
    if (this.ui.cfgRevealPopover) this.ui.cfgRevealPopover.classList.add('hidden');
    if (this.ui.btnCfgModeDropdown) this.ui.btnCfgModeDropdown.setAttribute('aria-expanded', 'false');
    if (this.ui.btnCfgPlayersDropdown) this.ui.btnCfgPlayersDropdown.setAttribute('aria-expanded', 'false');
    if (this.ui.btnCfgCursorDropdown) this.ui.btnCfgCursorDropdown.setAttribute('aria-expanded', 'false');
    if (this.ui.btnCfgRevealDropdown) this.ui.btnCfgRevealDropdown.setAttribute('aria-expanded', 'false');
  }

  openRoomSetupScreen(autoStartRoom = false) {
    this.ui.showRoomSetupView(true);
    if (autoStartRoom) {
      // Se foi direto pelo botão verde "Criar Sala", aplica o padrão (privada, 2 jogadores, modo normal)
      this.isRoomLocked = true;
      this.maxPlayers = 2;
      this.gameMode = 'normal';
      this.ui.updateMaxPlayersUI(this.maxPlayers);
      this.ui.updateGameModeUI(this.gameMode, this.revealLetters);
      this.ui.updateRoomConfigUI({
        isRoomLocked: this.isRoomLocked,
        showOpponentSelection: this.showOpponentSelection
      });
      this.handleCreateRoom();
    } else if (!this.isHostWaitingInLobby()) {
      if (this.ui.setupOpenRoomRow) this.ui.setupOpenRoomRow.classList.remove('hidden');
      this.ui.hostCodeDisplay.classList.add('hidden');
    }
  }

  handleCreateRoom() {
    this.role = 'host';
    this.matchStarted = false;
    this.players = [];
    this.myId = '';
    this.startNewMatchHistoryGroup();
    this.ui.showRoomSetupView(true);
    if (this.ui.setupOpenRoomRow) this.ui.setupOpenRoomRow.classList.add('hidden');
    this.ui.btnCreateRoom.disabled = true;
    if (this.ui.btnSetupOpenRoom) this.ui.btnSetupOpenRoom.disabled = true;
    this.ui.hostCodeDisplay.classList.remove('hidden');
    if (this.ui.btnStartMatch) {
      this.ui.btnStartMatch.classList.remove('hidden', 'ready', 'starting');
      this.ui.btnStartMatch.disabled = true;
      this.ui.btnStartMatch.textContent = 'Iniciar partida';
    }
    if (this.ui.btnCancelRoom) {
      this.ui.btnCancelRoom.classList.remove('hidden');
    }
    this.ui.hostStatus.textContent = 'Inicializando rede P2P...';

    const onRoomReady = () => {
      this.myId = this.network.myId;
      this.players = [this.makeSelfPlayer()];
      if (this.ui.btnSetupOpenRoom) this.ui.btnSetupOpenRoom.disabled = false;
      this.updateHostLobbyStatus();
    };

    if (this.isRoomLocked) {
      // Sala Privada (Trancada): gera e exibe código de 6 dígitos
      if (this.ui.hostPrivateCodeArea) {
        this.ui.hostPrivateCodeArea.classList.remove('hidden');
      }
      const code = this.network.createRoom({
        onOpen: onRoomReady,
        onError: () => {
          this.ui.hostStatus.textContent = 'Erro ao criar sala. Tente novamente.';
          this.ui.btnCreateRoom.disabled = false;
          if (this.ui.btnSetupOpenRoom) this.ui.btnSetupOpenRoom.disabled = false;
        }
      });
      this.ui.roomCodeVal.textContent = code;
    } else {
      // Sala Pública (Aberta): não libera código e registra vaga na listagem pública
      if (this.ui.hostPrivateCodeArea) {
        this.ui.hostPrivateCodeArea.classList.add('hidden');
      }
      this.network.createPublicRoom({
        onOpen: onRoomReady,
        onError: (err) => {
          this.ui.hostStatus.textContent = (err && err.message) || 'Erro ao abrir sala pública.';
          this.ui.btnCreateRoom.disabled = false;
          if (this.ui.btnSetupOpenRoom) this.ui.btnSetupOpenRoom.disabled = false;
        }
      });
    }
  }

  updateHostLobbyStatus() {
    if (this.role !== 'host' || this.matchStarted) return;
    const count = this.players.length;
    let text;
    if (count <= 1) {
      const waitingFor = this.maxPlayers === 2 ? 'adversário' : 'jogadores';
      text = this.isRoomLocked
        ? `Aguardando ${waitingFor} entrar... (1/${this.maxPlayers})`
        : `Sala pública aberta! Aguardando ${waitingFor}... (1/${this.maxPlayers})`;
    } else {
      text = `${count}/${this.maxPlayers} na sala: ${this.players.map(p => p.name).join(', ')}`;
    }
    this.ui.hostStatus.textContent = text;

    // Renderiza lista de jogadores com opção de kick
    this.ui.renderLobbyPlayersList(this.players, this.hostId, this.myId, (peerId) => this.kickPlayer(peerId));

    if (this.ui.btnCancelRoom) {
      this.ui.btnCancelRoom.classList.remove('hidden');
    }

    if (this.ui.btnStartMatch) {
      this.ui.btnStartMatch.classList.remove('hidden');
      const isFull = count >= this.maxPlayers;
      this.ui.btnStartMatch.classList.toggle('ready', isFull);
      this.ui.btnStartMatch.disabled = count < 2;
      if (!this.countdownTimer) {
        this.ui.btnStartMatch.textContent = 'Iniciar partida';
      }
    }
  }

  kickPlayer(peerId) {
    if (this.role !== 'host' || !peerId || peerId === this.myId) return;
    const player = this.getPlayer(peerId);
    if (!player) return;

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      if (this.ui.btnStartMatch) {
        this.ui.btnStartMatch.classList.remove('starting');
        this.ui.btnStartMatch.textContent = 'Iniciar partida';
      }
    }

    // Envia mensagem de KICK ao participante
    this.network.send({ type: 'KICK_PLAYER', targetId: peerId });
    this.network.removePeer(peerId);
    this.players = this.players.filter(p => p.id !== peerId);
    this.ui.showToast(`${player.name} foi expulso da sala.`);
    this.broadcastLobbyUpdate();
    this.updateHostLobbyStatus();
  }

  triggerCountdownAndStart() {
    if (this.role !== 'host' || this.matchStarted || this.players.length < 2) return;
    if (this.countdownTimer) return;

    let seconds = 3;
    if (this.ui.btnStartMatch) {
      this.ui.btnStartMatch.classList.add('starting');
      this.ui.btnStartMatch.textContent = `Iniciando em ${seconds}...`;
    }

    this.network.send({
      type: 'START_COUNTDOWN',
      seconds: seconds
    });
    this.ui.showToast(`Partida iniciando em ${seconds} segundos...`);

    this.countdownTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        if (this.ui.btnStartMatch) {
          this.ui.btnStartMatch.textContent = `Iniciando em ${seconds}...`;
        }
        this.network.send({
          type: 'START_COUNTDOWN',
          seconds: seconds
        });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        if (this.ui.btnStartMatch) {
          this.ui.btnStartMatch.classList.remove('starting');
          this.ui.btnStartMatch.textContent = 'Iniciar partida';
        }
        this.startNewRound(this.hostId);
      }
    }, 1000);
  }

  broadcastLobbyUpdate() {
    if (this.role !== 'host') return;
    this.network.send({
      type: 'LOBBY_UPDATE',
      from: this.myId,
      players: this.players,
      maxPlayers: this.maxPlayers
    });
  }

  /** Host decide se aceita a conexão de um jogador (nova entrada ou reconexão após migração). */
  acceptJoin(data, peerId) {
    if (this.role !== 'host') return false;
    if (data.type === 'REJOIN') return this.players.some(p => p.id === peerId);
    return !this.matchStarted && this.players.length > 0 && this.players.length < this.maxPlayers;
  }

  openPublicRoomsModal() {
    this.ui.showPublicRoomsModal(true);
    this.refreshPublicRoomsList();
  }

  closePublicRoomsModal() {
    this.network.destroyScanner();
    this.ui.showPublicRoomsModal(false);
  }

  refreshPublicRoomsList() {
    this.ui.setPublicRoomsLoading();
    const discoveredRooms = [];

    this.network.scanPublicRooms({
      onRoomFound: (room) => {
        discoveredRooms.push(room);
        this.ui.renderPublicRoomsList(discoveredRooms, (slotId) => this.handleJoinPublicSlot(slotId));
      },
      onComplete: (allRooms) => {
        this.ui.renderPublicRoomsList(allRooms, (slotId) => this.handleJoinPublicSlot(slotId));
      }
    });
  }

  sendJoinGame() {
    this.myId = this.network.myId;
    this.matchStarted = false;
    this.startNewMatchHistoryGroup();
    this.ui.joinStatus.textContent = 'Conectado! Aguardando o host...';
    this.network.send({
      type: 'JOIN_GAME',
      from: this.myId,
      name: this.profile.myName,
      avatar: this.profile.myAvatar
    });
  }

  handleJoinPublicSlot(slotId) {
    if (!slotId) return;
    this.closePublicRoomsModal();

    this.role = 'guest';
    this.ui.joinStatus.classList.remove('hidden');
    this.ui.joinStatus.textContent = 'Entrando na sala pública...';
    this.ui.btnJoinRoom.disabled = true;
    if (this.ui.btnJoinPublicRoom) this.ui.btnJoinPublicRoom.disabled = true;

    this.network.joinPublicRoom(slotId, {
      onConnected: () => this.sendJoinGame(),
      onError: () => {
        this.ui.joinStatus.textContent = 'Esta sala pública já foi preenchida ou fechada.';
        this.ui.btnJoinRoom.disabled = false;
        if (this.ui.btnJoinPublicRoom) this.ui.btnJoinPublicRoom.disabled = false;
      }
    });
  }

  handleJoinRoom() {
    const code = this.ui.inputRoomCode.value.trim();
    if (!code || code.length < 6) {
      this.ui.showToast('Digite um código de 6 dígitos');
      return;
    }

    this.role = 'guest';
    this.ui.joinStatus.classList.remove('hidden');
    this.ui.joinStatus.textContent = 'Conectando à sala...';
    this.ui.btnJoinRoom.disabled = true;

    this.network.joinRoom(code, {
      onConnected: () => this.sendJoinGame(),
      onError: () => {
        this.ui.joinStatus.textContent = 'Sala não encontrada ou indisponível.';
        this.ui.btnJoinRoom.disabled = false;
      }
    });
  }

  handleJoinRejected() {
    if (this.matchStarted) {
      this.ui.showToast('Não foi possível reconectar à sala.');
      setTimeout(() => this.resetToLobby(), 2000);
      return;
    }
    this.network.destroy();
    this.role = 'solo';
    this.ui.joinStatus.classList.remove('hidden');
    this.ui.joinStatus.textContent = 'Sala cheia ou partida já em andamento.';
    this.ui.btnJoinRoom.disabled = false;
    if (this.ui.btnJoinPublicRoom) this.ui.btnJoinPublicRoom.disabled = false;
  }

  copyRoomCode() {
    if (!this.network.roomCode) return;
    navigator.clipboard.writeText(this.network.roomCode).then(() => {
      this.ui.btnCopyCode.textContent = 'Copiado! ✓';
      setTimeout(() => { this.ui.btnCopyCode.textContent = 'Copiar Código'; }, 2000);
    });
  }

  syncProfileWithPeer() {
    const me = this.getPlayer(this.myId);
    if (me) {
      me.name = this.profile.myName;
      me.avatar = this.profile.myAvatar;
    }
    if (this.ui.lobbyScreen && this.ui.lobbyScreen.classList.contains('hidden')) {
      if (this.role === 'solo') this.updateStatusBar();
      else this.refreshScoreboard();
    }
    if (this.role !== 'solo' && this.network.isConnected()) {
      this.network.send({
        type: 'UPDATE_PROFILE',
        from: this.myId,
        name: this.profile.myName,
        avatar: this.profile.myAvatar
      });
    }
  }

  handleP2PMessage(data, fromId) {
    const from = data.from || fromId;

    switch (data.type) {
      case 'JOIN_GAME':
        if (this.role === 'host' && !this.getPlayer(fromId)) {
          this.players.push({
            id: fromId,
            name: data.name || `Jogador ${this.players.length + 1}`,
            avatar: data.avatar || '',
            score: 0
          });
          this.broadcastLobbyUpdate();
          this.updateHostLobbyStatus();
        }
        break;

      case 'REJOIN':
        // Jogador reconectado ao novo host após migração: sincroniza a lista de jogadores
        if (this.role === 'host') {
          this.network.send({
            type: 'PLAYERS_SYNC',
            from: this.myId,
            players: this.players
          });
        }
        break;

      case 'LOBBY_UPDATE':
        if (this.role === 'guest' && !this.matchStarted) {
          this.applyPlayersList(data.players);
          if (data.maxPlayers) this.maxPlayers = data.maxPlayers;
          this.ui.joinStatus.textContent =
            `Na sala (${this.players.length}/${this.maxPlayers}). Aguardando ${this.getPlayerName(this.hostId)} iniciar...`;
        }
        break;

      case 'PLAYERS_SYNC':
        if (this.role === 'guest') {
          this.applyPlayersList(data.players);
          if (this.matchStarted) this.refreshScoreboard();
        }
        break;

      case 'START_MATCH':
        if (this.role === 'guest') {
          this.applyPlayersList(data.players);
          if (data.maxPlayers) this.maxPlayers = data.maxPlayers;
          this.gameMode = data.gameMode || 'normal';
          this.revealLetters = Boolean(data.revealLetters);
          this.showOpponentSelection = typeof data.showOpponentSelection === 'boolean' ? data.showOpponentSelection : true;
          this.secrets = data.secrets || {};
          this.secretWord = this.gameMode === 'normal' ? data.secretWord : (this.secrets[this.myId] || data.secretWord);
          this.currentTurnId = data.startingId;
          this.roundStarterId = data.startingId;
          this.lastWinnerId = null;
          this.startMultiplayerMatch();
        }
        break;

      case 'LIVE_KEYSTROKE':
        if (this.mode === 'individual') break;
        this.handleOpponentKeystroke(data.action, data.letter, data.row, data.col, from);
        this.syncMirror();
        break;

      case 'CURSOR_MOVE':
        if (this.showOpponentSelection && from !== this.myId) {
          this.opponentCursor = { from: from, row: data.row, col: data.col };
          this.refreshHighlight();
        }
        break;

      case 'KICK_PLAYER':
        if (data.targetId === this.myId) {
          this.ui.showToast('Você foi removido da sala pelo host.');
          this.resetToLobby();
        }
        break;

      case 'START_COUNTDOWN':
        this.ui.showToast(`Partida iniciando em ${data.seconds}s...`);
        break;

      case 'SUBMIT_GUESS':
        if (this.mode === 'cross') {
          this.handleCrossGuess(from, data.guess, data.nextTurnId, data.row);
        } else if (this.mode === 'individual') {
          this.handleIndividualGuess(from, data.guess, data.row);
        } else {
          this.handleOpponentGuess(from, data.guess, data.evaluation, data.nextTurnId, data.isWin, data.row);
        }
        break;

      case 'MM_RESULT':
        if (this.mode === 'individual') this.applyIndividualResult(data.winnerId);
        break;

      case 'RESTART_REQUEST':
        if (this.role === 'host') {
          this.ui.showToast(`${this.getPlayerName(from)} reiniciou a partida!`);
          this.startNewRound(this.roundStarterId || this.hostId);
        }
        break;

      case 'TIME_EXPIRED':
        this.handleTimeExpiredByOpponent(from, data.nextTurnId, data.row);
        break;

      case 'UPDATE_PROFILE': {
        const p = this.getPlayer(from);
        if (p) {
          if (data.name) p.name = data.name;
          if (typeof data.avatar === 'string') p.avatar = data.avatar;
        }
        if (this.matchStarted) this.refreshScoreboard();
        else this.updateHostLobbyStatus();
        break;
      }

      case 'PLAYER_LEFT':
        if (this.role === 'guest') this.removePlayer(data.id);
        break;

      case 'RESTART_MATCH':
        if (data.secretWord) {
          this.secretWord = data.secretWord;
          this.currentTurnId = data.startingId || this.hostId;
          this.roundStarterId = this.currentTurnId;
          this.resetBoardState();
          this.startMultiplayerMatch();
          this.ui.showToast(`${data.senderName || this.getPlayerName(from)} reiniciou a partida!`);
        }
        break;

      case 'CHAT_MESSAGE':
        this.chat.handleIncomingMessage(data);
        break;

      case 'VOICE_REQUEST':
        if (this.voice) this.voice.handleIncomingRequest(data);
        break;

      case 'VOICE_ACCEPT':
        if (this.voice) this.voice.handleVoiceAccepted(from);
        break;

      case 'VOICE_REJECT':
        if (this.voice) this.voice.handleVoiceRejected();
        break;

      case 'VOICE_CANCEL':
        if (this.voice) this.voice.handleVoiceCancelled();
        break;

      case 'VOICE_END':
        if (this.voice) {
          this.voice.endVoiceCall(false);
          this.ui.showToast('Chat de voz encerrado pelo oponente.');
        }
        break;

      case 'PLAY_AGAIN_REQUEST':
        this.readyPlayers.add(from);
        this.ui.showToast(`${this.getPlayerName(from)} quer continuar jogando!`);
        this.checkAllReadyForNextRound();
        break;

      default:
        console.log('Mensagem desconhecida:', data);
    }
  }

  // ==========================================
  // ENTRADA / SAÍDA DE JOGADORES E MIGRAÇÃO DE HOST
  // ==========================================
  /** Host: inicia uma nova rodada para todos com o jogador inicial informado. */
  startNewRound(starterId) {
    if (this.role !== 'host') return;
    this.secretWord = this.rules.getRandomSecretWord();
    this.secrets = this.gameMode === 'normal' ? {} : this.generateSecrets();
    if (this.gameMode !== 'normal') this.secretWord = this.secrets[this.myId];
    this.currentTurnId = this.getPlayer(starterId) ? starterId : this.hostId;
    this.roundStarterId = this.currentTurnId;
    this.lastWinnerId = null;

    this.network.send({
      type: 'START_MATCH',
      from: this.myId,
      players: this.players,
      maxPlayers: this.maxPlayers,
      secretWord: this.secretWord,
      startingId: this.currentTurnId,
      gameMode: this.gameMode,
      revealLetters: this.revealLetters,
      showOpponentSelection: this.showOpponentSelection,
      secrets: this.secrets
    });

    this.startMultiplayerMatch();
  }

  /** Host: sorteia uma palavra secreta distinta para a grade de cada jogador. */
  generateSecrets() {
    const used = new Set();
    const map = {};
    this.players.forEach((p) => {
      let word;
      let tries = 0;
      do {
        word = this.rules.getRandomSecretWord();
        tries++;
      } while (used.has(word) && tries < 50);
      used.add(word);
      map[p.id] = word;
    });
    return map;
  }

  /** Quem ganhou começa a próxima rodada; sem vencedor, segue a fila a partir de quem iniciou. */
  getNextRoundStarter() {
    if (this.lastWinnerId && this.getPlayer(this.lastWinnerId)) return this.lastWinnerId;
    return this.nextPlayerId(this.roundStarterId || this.hostId);
  }

  /** Host: um convidado desconectou. */
  handlePeerLeft(peerId) {
    if (this.role !== 'host' || !this.getPlayer(peerId)) return;
    this.network.send({ type: 'PLAYER_LEFT', from: this.myId, id: peerId });
    this.removePlayer(peerId);
  }

  removePlayer(id) {
    const player = this.getPlayer(id);
    if (!player) return;

    const wasTurn = this.currentTurnId === id;
    const next = this.nextPlayerId(id);
    if (this.roundStarterId === id) this.roundStarterId = next;
    if (this.lastWinnerId === id) this.lastWinnerId = null;
    this.players = this.players.filter(p => p.id !== id);
    this.ui.showToast(`${player.name} saiu da sala.`);
    if (this.matchStarted && this.mode !== 'normal') {
      this.mm.removeBoard(id);
      delete this.secrets[id];
      delete this.progress[id];
    }

    if (!this.matchStarted) {
      if (this.role === 'host') {
        if (this.countdownTimer && this.players.length < 2) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          if (this.ui.btnStartMatch) {
            this.ui.btnStartMatch.classList.remove('starting');
            this.ui.btnStartMatch.textContent = 'Iniciar partida';
          }
        }
        this.broadcastLobbyUpdate();
        this.updateHostLobbyStatus();
      }
      return;
    }

    if (this.players.length < 2) {
      this.ui.showToast('Todos os oponentes saíram da sala.');
      setTimeout(() => this.resetToLobby(), 2500);
      return;
    }

    if (this.mode === 'individual') {
      this.refreshScoreboard();
      this.checkIndividualEnd();
      if (this.isGameOver) this.checkAllReadyForNextRound();
      return;
    }

    if (wasTurn && !this.isGameOver) {
      this.currentTurnId = next;
      if (!this.isRevealing) {
        this.clearUnsubmittedRow(this.currentRow);
        this.updateStatusBar();
      }
    } else {
      this.refreshScoreboard();
      if (this.isGameOver) this.checkAllReadyForNextRound();
    }
  }

  /** Convidado: a conexão com o host caiu. O próximo da fila assume como host. */
  handleHostLost(hostId) {
    if (this.role !== 'guest') return;
    const hostName = this.getPlayerName(hostId);

    if (!this.matchStarted) {
      this.ui.showToast('O host encerrou a sala.');
      this.resetToLobby();
      return;
    }

    const remaining = this.players.filter(p => p.id !== hostId);
    if (remaining.length < 2) {
      this.ui.showToast(`${hostName} se desconectou.`);
      setTimeout(() => this.resetToLobby(), 2500);
      return;
    }

    const newHostId = remaining[0].id;
    this.removePlayer(hostId);

    if (newHostId === this.myId) {
      this.role = 'host';
      this.network.becomeHost();
      this.ui.showToast('Você agora é o host da sala.');

      // Remove quem não conseguir se reconectar ao novo host
      clearTimeout(this.hostMigrationTimer);
      this.hostMigrationTimer = setTimeout(() => {
        if (this.role !== 'host') return;
        this.players
          .filter(p => p.id !== this.myId && !this.network.conns.has(p.id))
          .forEach(p => {
            this.network.send({ type: 'PLAYER_LEFT', from: this.myId, id: p.id });
            this.removePlayer(p.id);
          });
      }, 8000);
    } else {
      this.ui.showToast(`${this.getPlayerName(newHostId)} agora é o host.`);
      this.network.reconnectToHost(newHostId, {
        onConnected: () => {
          this.network.send({
            type: 'REJOIN',
            from: this.myId,
            name: this.profile.myName,
            avatar: this.profile.myAvatar
          });
        },
        onError: () => {
          this.ui.showToast('Não foi possível reconectar à sala.');
          setTimeout(() => this.resetToLobby(), 2000);
        }
      });
    }
  }

  // ==========================================
  // FLUXO DE PARTIDAS E TURNOS
  // ==========================================
  startSoloGame() {
    this.role = 'solo';
    this.players = [];
    this.myId = '';
    this.currentTurnId = '';
    this.matchStarted = false;
    this.infiniteStreak = 0;
    this.startNewMatchHistoryGroup();
    this.secretWord = this.rules.getRandomSecretWord();

    this.applyModeConfig();
    this.resetBoardState();
    this.ui.showRoomSetupView(false);
    this.ui.lobbyScreen.classList.add('hidden');
    this.ui.boardContainer.classList.remove('hidden');
    this.ui.keyboardContainer.classList.remove('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.remove('hidden');

    this.updateStatusBar();
    this.ui.showToast(
      this.soloMode === 'infinite'
        ? 'Modo Infinito iniciado! Boa sorte!'
        : 'Modo Clássico iniciado! Boa sorte!'
    );
  }

  /** Ajusta número de linhas e layout multigrade conforme o modo da partida. */
  applyModeConfig() {
    this.maxRows = this.getRowsForMode();
    this.ui.maxRows = this.maxRows;
    this.myDone = false;
    this.winnerDecided = false;
    this.progress = {};

    if (this.mode === 'normal') {
      this.mm.unmount();
      return;
    }
    this.players.forEach((p) => { this.progress[p.id] = { rows: 0, done: false }; });
    this.mm.mount({ players: this.players, myId: this.myId, maxRows: this.maxRows });
  }

  startMultiplayerMatch() {
    this.matchStarted = true;
    this.applyModeConfig();
    this.resetBoardState();
    this.ui.showRoomSetupView(false);
    this.ui.lobbyScreen.classList.add('hidden');
    this.ui.boardContainer.classList.remove('hidden');
    this.ui.keyboardContainer.classList.remove('hidden');
    this.ui.statusBar.classList.remove('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.remove('hidden');

    this.updateStatusBar();
    if (this.voice) this.voice.updateVisibility(true, true);
    if (this.isMyTurn()) this.broadcastCursorMove();
  }

  resetBoardState() {
    this.timer.stop();
    this.currentRow = 0;
    this.currentTile = 0;
    this.opponentCursor = null;
    this.isGameOver = false;
    this.isRevealing = false;
    this.readyPlayers.clear();
    if (this.ui.btnPlayAgain) {
      this.ui.btnPlayAgain.disabled = false;
      this.ui.btnPlayAgain.textContent = 'Continuar Jogando';
    }
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));

    this.ui.createBoard();
    this.ui.createKeyboard();
    this.ui.gameoverModal.classList.add('hidden');
    this.refreshHighlight();
  }

  /** Re-renderiza o placar sem reiniciar o cronômetro do turno. */
  refreshScoreboard() {
    if (this.role === 'solo' || !this.matchStarted) return;
    this.ui.renderScoreboard({
      players: this.players,
      myId: this.myId,
      currentTurnId: this.currentTurnId,
      isMyTurn: this.isMyTurn(),
      silent: true,
      turnless: this.mode === 'individual'
    });
    this.refreshMultiBoards();
    if (this.players.length > 2 && !this.isGameOver && this.mode !== 'individual') {
      this.ui.updateTurnBar(this.currentTurnId, this.timer.timeLeft, this.timer.turnDuration);
    }
    this.refreshHighlight();
  }

  /** Atualiza nomes e esmaecimento das grades (Cruzado: quem não joga fica transparente). */
  refreshMultiBoards() {
    if (this.mode === 'normal' || !this.mm.isMounted) return;
    this.mm.updateLabels(this.players, this.myId);
    this.mm.setActive(this.mode === 'cross' && !this.isGameOver ? this.currentTurnId : null);
  }

  /** Cruzado: espelha a linha digitada nas grades dos oponentes. */
  syncMirror(row = this.currentRow) {
    if (this.mode !== 'cross' || !this.mm.isMounted || row < 0 || row >= this.maxRows) return;
    this.mm.mirrorRow(row, this.boardMatrix[row], this.revealLetters);
  }

  updateStatusBar() {
    if (this.role === 'solo') {
      this.timer.hide();
      if (this.soloMode === 'infinite') {
        this.ui.renderInfiniteScoreboard(this.infiniteStreak, this.infiniteBest);
      } else {
        this.ui.statusBar.classList.add('hidden');
      }
      this.ui.keyboardElement.classList.remove('locked');
      this.refreshHighlight();
      return;
    }

    const useBar = this.players.length > 2;
    const turnless = this.mode === 'individual';
    this.ui.renderScoreboard({
      players: this.players,
      myId: this.myId,
      currentTurnId: this.currentTurnId,
      isMyTurn: this.isMyTurn(),
      turnless
    });
    this.refreshMultiBoards();

    this.refreshHighlight();
    if (turnless) {
      this.timer.hide();
      return;
    }
    this.timer.start({
      isGameOver: this.isGameOver,
      role: this.role,
      isMyTurnFn: () => this.isMyTurn(),
      onTimeout: () => this.handleTurnTimeout(),
      useBar,
      onTick: useBar ? (timeLeft, duration) => this.ui.updateTurnBar(this.currentTurnId, timeLeft, duration) : null
    });
  }

  handleTurnTimeout() {
    this.timer.stop();
    if (this.isGameOver || this.isRevealing || this.role === 'solo') return;

    if (this.isMyTurn()) {
      const nextTurnId = this.nextPlayerId(this.myId);
      this.ui.showToast(this.players.length > 2
        ? 'Tempo esgotado! Vez passada para o próximo jogador.'
        : 'Tempo esgotado! Vez passada para o oponente.');
      this.clearUnsubmittedRow(this.currentRow);

      this.network.send({
        type: 'TIME_EXPIRED',
        from: this.myId,
        nextTurnId: nextTurnId,
        row: this.currentRow
      });

      this.currentTurnId = nextTurnId;
      this.opponentCursor = null;
      this.updateStatusBar();
      if (this.isMyTurn()) this.broadcastCursorMove();
    }
  }

  handleTimeExpiredByOpponent(fromId, nextTurnId, row) {
    this.timer.stop();
    if (typeof row === 'number' && row >= 0 && row < this.maxRows) {
      this.currentRow = row;
    }
    this.opponentCursor = null;
    this.clearUnsubmittedRow(this.currentRow);
    const name = this.getPlayerName(fromId);
    this.ui.showToast(nextTurnId === this.myId ? `Tempo de ${name} esgotou! Sua vez.` : `Tempo de ${name} esgotou!`);
    this.currentTurnId = nextTurnId;
    this.updateStatusBar();
    if (this.voice) this.voice.updateVisibility(true, true);
    if (this.isMyTurn()) this.broadcastCursorMove();
  }

  clearUnsubmittedRow(row) {
    if (row < 0 || row >= this.maxRows) return;
    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[row][c] = '';
      const tile = this.ui.getTileElement(row, c);
      if (tile && !tile.classList.contains('flip')) {
        tile.textContent = '';
        tile.classList.remove('filled', 'opponent-typing', 'active-cursor', 'hint-absent', 'hint-present');
      }
    }
    this.currentTile = 0;
    this.syncMirror(row);
  }

  // ==========================================
  // NAVEGAÇÃO DO CURSOR E ENTRADA DE DADOS
  // ==========================================
  handleTileClick(r, c) {
    if (this.isGameOver || this.isRevealing || !this.isMyTurn()) return;
    if (r !== this.currentRow) return;

    this.currentTile = Math.max(0, Math.min(this.wordLength - 1, c));
    this.refreshHighlight();
    this.broadcastCursorMove();
  }

  broadcastCursorMove() {
    if (this.role === 'solo' || !this.showOpponentSelection) return;
    if (this.network && this.network.isConnected()) {
      this.network.send({
        type: 'CURSOR_MOVE',
        from: this.myId,
        row: this.currentRow,
        col: Math.min(this.currentTile, this.wordLength - 1)
      });
    }
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
      this.broadcastCursorMove();
    }
  }

  moveCursorLeft() {
    if (this.currentTile > 0) {
      this.currentTile--;
      this.refreshHighlight();
      this.broadcastCursorMove();
    }
  }

  moveCursorRight() {
    if (this.currentTile < this.wordLength - 1) {
      this.currentTile++;
      this.refreshHighlight();
      this.broadcastCursorMove();
    }
  }

  handlePhysicalKeyPress(e) {
    if (this.isGameOver || this.isRevealing || this.ui.lobbyScreen.offsetParent !== null) return;
    if (this.ui.helpModal.offsetParent !== null || this.ui.gameoverModal.offsetParent !== null) return;
    if (this.ui.wordsHistoryModal && this.ui.wordsHistoryModal.offsetParent !== null) return;
    if (this.profile.isModalOpen()) return;
    if (this.ui.privacyModal && this.ui.privacyModal.offsetParent !== null) return;
    if (this.ui.exitConfirmModal && this.ui.exitConfirmModal.offsetParent !== null) return;

    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (!this.isMyTurn()) {
      this.ui.showToast(this.notMyTurnMessage());
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
      this.ui.showToast(this.notMyTurnMessage());
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
      tileEl.classList.remove('opponent-typing', 'hint-absent', 'hint-present');
      tileEl.classList.add('filled');
      const hint = this.getLetterHint(letter, col);
      if (hint) tileEl.classList.add(hint);
    }

    if (this.currentTile < this.wordLength - 1) {
      this.currentTile++;
    } else {
      this.currentTile = this.wordLength;
    }
    this.refreshHighlight();
    this.broadcastCursorMove();

    this.syncMirror();
    if (this.role !== 'solo' && this.mode !== 'individual') {
      this.network.send({
        type: 'LIVE_KEYSTROKE',
        action: 'ADD',
        letter: letter,
        row: this.currentRow,
        col: col
      });
    }
  }

  // Dica visual: letra já descartada (vermelho) ou já vista como "presente" nesta mesma posição (amarelo)
  getLetterHint(letter, col) {
    if (this.role !== 'solo') return null;
    let seenAbsent = false;
    let seenInWord = false;
    let presentHere = false;
    for (let r = 0; r < this.currentRow; r++) {
      for (let c = 0; c < this.wordLength; c++) {
        const t = this.ui.getTileElement(r, c);
        if (!t || t.textContent !== letter) continue;
        if (t.classList.contains('absent')) seenAbsent = true;
        else if (t.classList.contains('correct')) seenInWord = true;
        else if (t.classList.contains('present')) {
          seenInWord = true;
          if (c === col) presentHere = true;
        }
      }
    }
    if (presentHere) return 'hint-present';
    if (seenAbsent && !seenInWord) return 'hint-absent';
    return null;
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
      tileEl.classList.remove('filled', 'opponent-typing', 'hint-absent', 'hint-present');
    }
    this.refreshHighlight();
    this.broadcastCursorMove();

    this.syncMirror();
    if (this.role !== 'solo' && this.mode !== 'individual') {
      this.network.send({
        type: 'LIVE_KEYSTROKE',
        action: 'DELETE',
        row: this.currentRow,
        col: col
      });
    }
  }

  handleOpponentKeystroke(action, letter, row, col, fromId) {
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
    if (this.showOpponentSelection) {
      this.opponentCursor = {
        from: fromId,
        row: targetRow,
        col: Math.min(this.currentTile, this.wordLength - 1)
      };
      this.refreshHighlight();
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
    const nextTurnId = this.role === 'solo' ? '' : this.nextPlayerId(this.myId);

    if (this.mode === 'cross') {
      this.submitCrossGuess(guess, evaluation, nextTurnId);
      return;
    }
    if (this.mode === 'individual') {
      this.submitIndividualGuess(guess, evaluation, isWin);
      return;
    }

    this.timer.stop();

    this.isRevealing = true;
    this.opponentCursor = null;
    this.ui.keyboardElement.classList.add('locked');
    this.refreshHighlight();

    const submittedRow = this.currentRow;
    const sendGuess = (win) => {
      if (this.role === 'solo') return;
      this.network.send({
        type: 'SUBMIT_GUESS',
        from: this.myId,
        guess: guess,
        evaluation: evaluation,
        nextTurnId: nextTurnId,
        isWin: win,
        row: submittedRow
      });
    };

    this.ui.animateRowReveal(submittedRow, guess, evaluation, () => {
      this.isRevealing = false;
      if (isWin) {
        if (this.role === 'solo' && this.soloMode === 'infinite') {
          this.advanceInfiniteWord(guess);
          return;
        }
        this.triggerWin(this.myId, true);
        sendGuess(true);
      } else {
        this.currentRow = submittedRow + 1;
        this.currentTile = 0;

        if (this.currentRow >= this.maxRows) {
          this.triggerGameOverLoss();
          sendGuess(false);
        } else {
          if (this.role !== 'solo') {
            this.currentTurnId = nextTurnId;
            sendGuess(false);
          }
          this.updateStatusBar();
          if (this.isMyTurn()) this.broadcastCursorMove();
        }
      }
    });
  }

  /**
   * Modo Infinito (Solo): ao acertar uma palavra, incrementa a sequência,
   * limpa o tabuleiro e sobe a palavra acertada para a 1ª linha já avaliada contra a nova palavra secreta.
   */
  advanceInfiniteWord(previousWord) {
    this.recordGuessedWord(previousWord, true, 'Você');
    this.infiniteStreak++;
    if (this.infiniteStreak > this.infiniteBest) {
      this.infiniteBest = this.infiniteStreak;
      try {
        localStorage.setItem('termo_infinite_best', String(this.infiniteBest));
      } catch (e) {}
    }
    this.ui.renderInfiniteScoreboard(this.infiniteStreak, this.infiniteBest);

    if (window.confetti) {
      confetti({
        particleCount: 55,
        spread: 60,
        origin: { y: 0.65 }
      });
    }
    this.ui.showToast(`+${this.infiniteStreak} • Próxima palavra!`);

    this.isRevealing = true;
    this.ui.keyboardElement.classList.add('locked');

    setTimeout(() => {
      if (this.isGameOver || this.role !== 'solo' || this.soloMode !== 'infinite') return;

      let nextSecret = this.rules.getRandomSecretWord();
      let tries = 0;
      while (nextSecret === previousWord && tries < 50) {
        nextSecret = this.rules.getRandomSecretWord();
        tries++;
      }
      this.secretWord = nextSecret;

      this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));
      this.ui.createBoard();
      this.ui.createKeyboard();

      // Preenche a linha 0 com a palavra que acabou de ser acertada
      for (let c = 0; c < this.wordLength; c++) {
        this.boardMatrix[0][c] = previousWord[c];
        const tile = this.ui.getTileElement(0, c);
        if (tile) {
          tile.textContent = previousWord[c];
          tile.classList.add('filled');
        }
      }

      const evaluation = this.rules.evaluateGuess(previousWord, this.secretWord);
      this.ui.animateRowReveal(0, previousWord, evaluation, () => {
        this.isRevealing = false;
        this.currentRow = 1;
        this.currentTile = 0;
        this.ui.keyboardElement.classList.remove('locked');
        this.refreshHighlight();
      });
    }, 650);
  }

  handleOpponentGuess(fromId, guess, evaluation, nextTurnId, isWin, row) {
    this.timer.stop();
    this.isRevealing = true;
    this.opponentCursor = null;
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
      tile.textContent = this.revealLetters ? guess[c] : '';
      tile.classList.add('filled');
    }

    this.ui.animateRowReveal(opponentRow, guess, evaluation, () => {
      this.isRevealing = false;
      if (isWin) {
        this.triggerWin(fromId, false);
      } else {
        this.currentRow = opponentRow + 1;
        this.currentTile = 0;

        if (this.currentRow >= this.maxRows) {
          this.triggerGameOverLoss();
        } else {
          // Se o próximo da vez saiu durante a animação, segue a fila
          this.currentTurnId = this.getPlayer(nextTurnId) ? nextTurnId : this.nextPlayerId(fromId);
          this.updateStatusBar();
          if (this.isMyTurn()) this.broadcastCursorMove();
        }
      }
    }, this.revealLetters);
  }

  // ==========================================
  // MODO CRUZADO (cada jogador com sua grade; cada palpite preenche todas)
  // ==========================================
  /** Resultado de um palpite no modo Cruzado: vitória (própria palavra), fim sem vencedor (palavra alheia) ou nada. */
  getCrossOutcome(guesserId, guess) {
    if (this.secrets[guesserId] === guess) return { type: 'win', winnerId: guesserId };
    const ownerId = Object.keys(this.secrets).find(id => id !== guesserId && this.secrets[id] === guess);
    if (ownerId) return { type: 'nowinner', guesserId, ownerId };
    return null;
  }

  /** Anima o palpite nas grades dos oponentes (avaliado contra a palavra de cada dono). */
  revealOnOtherBoards(guess, row, exceptId, showLetters = true) {
    this.players.forEach((p) => {
      if (p.id === this.myId || p.id === exceptId || !this.secrets[p.id]) return;
      this.mm.revealRow(p.id, row, guess, this.rules.evaluateGuess(guess, this.secrets[p.id]), showLetters);
    });
  }

  submitCrossGuess(guess, evaluation, nextTurnId) {
    this.timer.stop();
    this.isRevealing = true;
    this.opponentCursor = null;
    this.ui.keyboardElement.classList.add('locked');
    this.refreshHighlight();

    const submittedRow = this.currentRow;
    this.revealOnOtherBoards(guess, submittedRow, null, this.revealLetters);

    this.ui.animateRowReveal(submittedRow, guess, evaluation, () => {
      this.isRevealing = false;
      const outcome = this.getCrossOutcome(this.myId, guess);
      this.network.send({
        type: 'SUBMIT_GUESS',
        from: this.myId,
        guess,
        nextTurnId,
        row: submittedRow,
        isWin: Boolean(outcome && outcome.type === 'win')
      });
      this.advanceCrossRound(this.myId, outcome, submittedRow, nextTurnId);
    });
  }

  handleCrossGuess(fromId, guess, nextTurnId, row) {
    this.timer.stop();
    this.isRevealing = true;
    this.opponentCursor = null;
    this.refreshHighlight();
    const guessRow = (typeof row === 'number' && row >= 0 && row < this.maxRows) ? row : this.currentRow;
    this.currentRow = guessRow;
    const rowEl = this.ui.getRowElement(guessRow);
    if (rowEl) rowEl.classList.add('opponent-row');

    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[guessRow][c] = guess[c];
      const tile = this.ui.getTileElement(guessRow, c);
      tile.textContent = guess[c];
      tile.classList.add('filled');
    }

    // Grades dos demais jogadores (inclusive a de quem palpitou) e a minha, cada uma com sua palavra
    this.revealOnOtherBoards(guess, guessRow, null, this.revealLetters);
    const evaluation = this.rules.evaluateGuess(guess, this.secretWord);
    this.ui.animateRowReveal(guessRow, guess, evaluation, () => {
      this.isRevealing = false;
      this.advanceCrossRound(fromId, this.getCrossOutcome(fromId, guess), guessRow, nextTurnId);
    });
  }

  /** Após revelar um palpite do Cruzado: encerra a partida ou passa a vez. */
  advanceCrossRound(fromId, outcome, row, nextTurnId) {
    if (outcome && outcome.type === 'win') {
      this.triggerWin(fromId, fromId === this.myId);
      return;
    }
    if (outcome && outcome.type === 'nowinner') {
      this.triggerNoWinner(
        `${this.getPlayerName(outcome.guesserId)} acertou a palavra de ${this.getPlayerName(outcome.ownerId)}.`
      );
      return;
    }

    this.currentRow = row + 1;
    this.currentTile = 0;
    if (this.currentRow >= this.maxRows) {
      this.triggerNoWinner(`Ninguém acertou em ${this.maxRows} tentativas.`);
      return;
    }
    this.currentTurnId = this.getPlayer(nextTurnId) ? nextTurnId : this.nextPlayerId(fromId);
    this.updateStatusBar();
    if (this.voice) this.voice.updateVisibility(true, true);
    if (this.isMyTurn()) this.broadcastCursorMove();
  }

  // ==========================================
  // MODO INDIVIDUAL (todos jogam ao mesmo tempo; quem acertar primeiro vence)
  // ==========================================
  submitIndividualGuess(guess, evaluation, isWin) {
    this.isRevealing = true;
    this.ui.keyboardElement.classList.add('locked');
    this.refreshHighlight();

    const submittedRow = this.currentRow;
    this.ui.animateRowReveal(submittedRow, guess, evaluation, () => {
      this.isRevealing = false;
      this.network.send({
        type: 'SUBMIT_GUESS',
        from: this.myId,
        guess,
        row: submittedRow,
        isWin
      });
      this.registerIndividualProgress(this.myId, submittedRow, isWin);

      if (isWin) {
        this.myDone = true;
        if (this.role === 'host') this.decideIndividualWinner(this.myId);
        else this.ui.showToast('Palavra certa! Aguardando confirmação...');
      } else {
        this.currentRow = submittedRow + 1;
          this.currentTile = 0;
          this.broadcastCursorMove();
        if (this.currentRow >= this.maxRows) {
          this.myDone = true;
          this.ui.showToast('Suas tentativas acabaram. Aguardando os demais...');
        }
      }

      if (!this.myDone && !this.isGameOver) this.ui.keyboardElement.classList.remove('locked');
      this.refreshHighlight();
      this.checkIndividualEnd();
    });
  }

  handleIndividualGuess(fromId, guess, row) {
    const secret = this.secrets[fromId];
    if (!secret || !this.getPlayer(fromId)) return;
    if (this.opponentCursor && this.opponentCursor.from === fromId) {
      this.opponentCursor = null;
      this.refreshHighlight();
    }
    const evaluation = this.rules.evaluateGuess(guess, secret);
    const isWin = evaluation.every(s => s === 'correct');
    this.mm.revealRow(fromId, row, guess, evaluation, this.revealLetters);
    this.registerIndividualProgress(fromId, row, isWin);
    if (isWin) this.decideIndividualWinner(fromId);
    else this.checkIndividualEnd();
  }

  registerIndividualProgress(id, row, isWin) {
    const prog = this.progress[id] || (this.progress[id] = { rows: 0, done: false });
    prog.rows = Math.max(prog.rows, row + 1);
    if (isWin || prog.rows >= this.maxRows) prog.done = true;
    prog.won = Boolean(isWin);
  }

  /** Host: o primeiro palpite vencedor recebido define o vencedor e avisa todos. */
  decideIndividualWinner(winnerId) {
    if (this.role !== 'host' || this.winnerDecided) return;
    this.winnerDecided = true;
    this.network.send({ type: 'MM_RESULT', from: this.myId, winnerId });
    this.applyIndividualResult(winnerId);
  }

  /** Host: se todos esgotaram as tentativas sem acertar, encerra sem vencedor. */
  checkIndividualEnd() {
    if (this.role !== 'host' || this.winnerDecided || this.isGameOver) return;
    const allDone = this.players.length > 0 && this.players.every(p => this.progress[p.id] && this.progress[p.id].done);
    if (!allDone) return;
    this.winnerDecided = true;
    this.network.send({ type: 'MM_RESULT', from: this.myId, winnerId: null });
    this.applyIndividualResult(null);
  }

  applyIndividualResult(winnerId) {
    if (this.isGameOver) return;
    this.myDone = true;
    this.ui.keyboardElement.classList.add('locked');
    if (winnerId && this.getPlayer(winnerId)) {
      const prog = this.progress[winnerId];
      this.triggerWin(winnerId, winnerId === this.myId, prog ? `${prog.rows}/${this.maxRows}` : undefined);
    } else {
      this.triggerNoWinner(`Ninguém acertou em ${this.maxRows} tentativas.`);
    }
  }

  /** Texto com a palavra secreta de cada grade (modos Cruzado/Individual) ou a palavra única do modo Normal. */
  getSecretsDisplay() {
    if (this.mode === 'normal') return this.secretWord;
    return this.players
      .filter(p => this.secrets[p.id])
      .map(p => `${p.id === this.myId ? 'Você' : p.name}: ${this.secrets[p.id]}`)
      .join('\n');
  }

  /** Fim de partida sem vencedor nos modos Cruzado/Individual. */
  triggerNoWinner(detail) {
    this.timer.stop();
    this.isGameOver = true;
    this.refreshScoreboard();
    this.refreshHighlight();
    setTimeout(() => {
      this.ui.showGameOverModal({
        title: 'FIM DA PARTIDA',
        color: '#fff',
        subtitle: `Não houve vencedor. ${detail || ''}`.trim(),
        secretWord: this.getSecretsDisplay(),
        secretLabel: 'Palavras Secretas:',
        winnerName: 'Ninguém',
        attemptsText: `${Math.min(this.currentRow + 1, this.maxRows)}/${this.maxRows}`,
        playAgainText: 'Continuar Jogando'
      });
    }, 1200);
  }

  triggerWin(winnerId, isMe, attemptsText) {
    this.timer.stop();
    this.isGameOver = true;

    const winnerName = isMe ? this.profile.myName : this.getPlayerName(winnerId);
    const guessedWord = this.mode === 'normal' ? this.secretWord : (this.secrets[winnerId] || this.secretWord);
    this.recordGuessedWord(guessedWord, isMe, winnerName);
    if (this.role !== 'solo') {
      const winner = this.getPlayer(winnerId);
      if (winner) winner.score++;
      // Quem ganhou começa a próxima rodada
      this.lastWinnerId = winnerId;
      this.refreshScoreboard();
    }

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
        secretWord: this.getSecretsDisplay(),
        secretLabel: this.mode === 'normal' ? 'Palavra Secreta:' : 'Palavras Secretas:',
        winnerName: winnerName,
        attemptsText: attemptsText || `${this.currentRow + 1}/${this.maxRows}`
      });
    }, 1800);
  }

  triggerGameOverLoss() {
    this.timer.stop();
    this.isGameOver = true;
    const isInfinite = this.role === 'solo' && this.soloMode === 'infinite';
    setTimeout(() => {
      if (isInfinite) {
        this.ui.showGameOverModal({
          title: 'FIM DA SEQUÊNCIA',
          color: 'var(--color-present)',
          subtitle: this.infiniteStreak === 1
            ? 'Você acertou 1 palavra seguida!'
            : `Você acertou ${this.infiniteStreak} palavras seguidas!`,
          secretWord: this.secretWord,
          winnerLabel: 'Sequência',
          winnerName: `${this.infiniteStreak}`,
          attemptsLabel: 'Recorde',
          attemptsText: `${this.infiniteBest}`,
          playAgainText: 'Continuar Jogando'
        });
        return;
      }
      this.ui.showGameOverModal({
        title: 'FIM DE JOGO',
        color: '#fff',
        subtitle: `Ninguém acertou em ${this.maxRows} tentativas.`,
        secretWord: this.secretWord,
        winnerName: 'Empate',
        attemptsText: `${this.maxRows}/${this.maxRows}`
      });
    }, 1200);
  }

  handlePlayAgainRequest() {
    if (this.role === 'solo') {
      this.startSoloGame();
      return;
    }
    if (!this.isGameOver || this.readyPlayers.has(this.myId)) return;

    this.readyPlayers.add(this.myId);
    if (this.ui.btnPlayAgain) {
      this.ui.btnPlayAgain.disabled = true;
      this.ui.btnPlayAgain.textContent = 'Esperando oponente';
    }
    this.network.send({ type: 'PLAY_AGAIN_REQUEST', from: this.myId });
    this.checkAllReadyForNextRound();
  }

  checkAllReadyForNextRound() {
    if (this.role !== 'host' || !this.isGameOver) return;
    if (this.players.length >= 2 && this.players.every(p => this.readyPlayers.has(p.id))) {
      this.startNewRound(this.getNextRoundStarter());
    }
  }

  resetToLobby() {
    this.timer.stop();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    clearTimeout(this.hostMigrationTimer);
    this.isGameOver = true;
    this.matchStarted = false;
    this.players = [];
    this.myId = '';
    this.currentTurnId = '';
    this.roundStarterId = '';
    this.lastWinnerId = null;
    this.opponentCursor = null;
    this.ui.updateScoreDisplay(0, 0);
    this.mm.unmount();
    this.network.destroy();

    this.role = 'solo';

    this.ui.gameoverModal.classList.add('hidden');
    if (this.ui.privacyModal) this.ui.privacyModal.classList.add('hidden');
    if (this.ui.publicRoomsModal) this.ui.publicRoomsModal.classList.add('hidden');
    if (this.ui.exitConfirmModal) this.ui.exitConfirmModal.classList.add('hidden');
    if (this.ui.wordsHistoryModal) this.ui.wordsHistoryModal.classList.add('hidden');
    this.ui.helpModal.classList.add('hidden');
    this.ui.boardContainer.classList.add('hidden');
    this.ui.keyboardContainer.classList.add('hidden');
    this.ui.statusBar.classList.add('hidden');
    if (this.ui.btnHome) this.ui.btnHome.classList.add('hidden');
    this.ui.hostCodeDisplay.classList.add('hidden');
    if (this.ui.btnStartMatch) {
      this.ui.btnStartMatch.classList.add('hidden');
      this.ui.btnStartMatch.classList.remove('starting', 'ready');
      this.ui.btnStartMatch.textContent = 'Iniciar partida';
    }
    if (this.ui.btnCancelRoom) this.ui.btnCancelRoom.classList.add('hidden');
    if (this.ui.lobbyRoomPlayersWrap) this.ui.lobbyRoomPlayersWrap.classList.add('hidden');
    if (this.ui.lobbyRoomPlayersList) this.ui.lobbyRoomPlayersList.innerHTML = '';
    this.ui.showSoloModePopover(false);
    this.ui.showRoomSetupView(false);
    this.ui.joinStatus.classList.add('hidden');
    this.ui.btnCreateRoom.disabled = false;
    this.ui.btnJoinRoom.disabled = false;
    if (this.ui.btnJoinPublicRoom) this.ui.btnJoinPublicRoom.disabled = false;
    this.ui.updateRoomConfigUI({
      isRoomLocked: this.isRoomLocked,
      showOpponentSelection: this.showOpponentSelection
    });

    this.chat.reset();
    if (this.voice) {
      this.voice.reset();
      this.voice.updateVisibility(false, false);
    }

    this.ui.lobbyScreen.classList.remove('hidden');
  }
}

// Inicializa o jogo ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  window.termoGame = new TermoMultiplayerGame();
});
