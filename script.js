/**
 * TERMO MULTIPLAYER P2P (WebRTC)
 * Baseado na tecnologia de conexão P2P WebRTC usada no Relatum (PeerJS)
 */

class TermoMultiplayerGame {
  constructor() {
    this.wordsList = [
      { id: 1, word: 'TERMO', normalized: 'TERMO' },
      { id: 2, word: 'SORTE', normalized: 'SORTE' },
      { id: 3, word: 'FEZES', normalized: 'FEZES' },
      { id: 4, word: 'TURMA', normalized: 'TURMA' },
      { id: 5, word: 'VIOLA', normalized: 'VIOLA' },
      { id: 6, word: 'PULGA', normalized: 'PULGA' },
      { id: 7, word: 'SAGAZ', normalized: 'SAGAZ' },
      { id: 8, word: 'NOBRE', normalized: 'NOBRE' },
      { id: 9, word: 'FOGAO', normalized: 'FOGAO' },
      { id: 10, word: 'PLUMA', normalized: 'PLUMA' }
    ];

    // Configurações do jogo
    this.maxRows = 6;
    this.wordLength = 5;
    this.currentRow = 0;
    this.currentTile = 0;
    this.secretWord = '';
    this.isGameOver = false;

    // Multiplayer / P2P
    this.role = 'solo'; // 'host', 'guest', 'solo'
    this.peer = null;
    this.peerConn = null;
    this.roomCode = '';
    // Perfil do Jogador (Nome e Foto em base64)
    this.myName = localStorage.getItem('termo_player_name') || 'Jogador 1';
    this.myAvatar = localStorage.getItem('termo_player_avatar') || '';
    this.oppName = 'Oponente';
    this.oppAvatar = '';
    this.tempAvatar = this.myAvatar;
    this.currentTurnRole = 'host'; // Quem joga agora ('host' ou 'guest' ou 'solo')

    // Matriz de letras no tabuleiro [linha][coluna]
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));
    // Status das letras no teclado: { 'A': 'correct' | 'present' | 'absent' }
    this.keyboardStatus = {};
    this.validWordsSet = new Set(this.wordsList.map(w => (w.normalized || w.word).toUpperCase()));
    this.audioCtx = null;

    // Sistema de Pontuação / Placar
    this.myScore = 0;
    this.oppScore = 0;

    // Sistema de Tempo (3 minutos por jogador / 180 segundos)
    this.turnDuration = 180;
    this.timeLeft = this.turnDuration;
    this.timerInterval = null;

    this.initDOM();
    this.initEvents();
    this.createBoard();
    this.createKeyboard();
    this.loadWordsDatabase();
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

  // Carrega palavras do JSON caso disponível
  async loadWordsDatabase() {
    try {
      const res = await fetch('words.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.wordsList = data;
          this.validWordsSet = new Set(this.wordsList.map(w => (w.normalized || w.word).toUpperCase()));
        }
      }
    } catch (e) {
      console.warn('Usando lista de palavras interna padrão');
    }
  }

  initDOM() {
    this.lobbyScreen = document.getElementById('lobby-screen');
    this.boardContainer = document.getElementById('board-container');
    this.keyboardContainer = document.getElementById('keyboard-container');
    this.boardElement = document.getElementById('board');
    this.keyboardElement = document.getElementById('keyboard');
    this.statusBar = document.getElementById('game-status-bar');
    this.gameActionsBar = document.getElementById('game-actions-bar');
    this.btnSurrender = document.getElementById('btn-surrender');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.toastMessage = document.getElementById('toast-message');
    this.turnTimerElement = document.getElementById('turn-timer');

    // Badges jogadores e placar
    this.p1Badge = document.getElementById('p1-badge');
    this.p2Badge = document.getElementById('p2-badge');
    this.p1ScoreElement = document.getElementById('p1-score');
    this.p2ScoreElement = document.getElementById('p2-score');
    this.scoreVsElement = document.querySelector('.score-vs');

    // Elementos de Perfil / Avatar
    this.p1AvatarImg = document.getElementById('p1-avatar-img');
    this.p1AvatarPh = document.getElementById('p1-avatar-ph');
    this.p2AvatarImg = document.getElementById('p2-avatar-img');
    this.p2AvatarPh = document.getElementById('p2-avatar-ph');

    this.homeAvatarImg = document.getElementById('home-avatar-img');
    this.homeAvatarPh = document.getElementById('home-avatar-ph');
    this.homePlayerName = document.getElementById('home-player-name');
    this.lobbyAvatarTrigger = document.getElementById('lobby-avatar-trigger');
    this.btnQuickEditName = document.getElementById('btn-quick-edit-name');

    // Modal de Perfil
    this.profileModal = document.getElementById('profile-modal');
    this.btnProfile = document.getElementById('btn-profile');
    this.btnCloseProfile = document.getElementById('btn-close-profile');
    this.modalAvatarPreview = document.getElementById('modal-avatar-preview');
    this.modalAvatarPlaceholder = document.getElementById('modal-avatar-placeholder');
    this.btnChooseAvatar = document.getElementById('btn-choose-avatar');
    this.btnRemoveAvatar = document.getElementById('btn-remove-avatar');
    this.inputAvatarFile = document.getElementById('input-avatar-file');
    this.inputProfileName = document.getElementById('input-profile-name');
    this.btnSaveProfile = document.getElementById('btn-save-profile');

    // Botões do Lobby
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.hostCodeDisplay = document.getElementById('host-code-display');
    this.roomCodeVal = document.getElementById('room-code-val');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.hostStatus = document.getElementById('host-status');

    this.inputRoomCode = document.getElementById('input-room-code');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.joinStatus = document.getElementById('join-status');
    this.btnPractice = document.getElementById('btn-practice');

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
  }

  initEvents() {
    // Ações do Lobby
    this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());
    this.btnPractice.addEventListener('click', () => this.startSoloGame());
    this.btnCopyCode.addEventListener('click', () => this.copyRoomCode());

    // Teclado Físico
    window.addEventListener('keydown', (e) => this.handlePhysicalKeyPress(e));

    // Modais
    this.btnHelp.addEventListener('click', () => this.showHelpModal(true));
    this.btnCloseHelp.addEventListener('click', () => this.showHelpModal(false));
    this.btnHelpOk.addEventListener('click', () => this.showHelpModal(false));
    this.btnBackLobby.addEventListener('click', () => this.resetToLobby());
    this.btnRestart.addEventListener('click', () => this.resetToLobby());
    this.btnSurrender.addEventListener('click', () => this.handleSurrender());
    this.btnPlayAgain.addEventListener('click', () => this.handlePlayAgainRequest());

    if (this.btnPrivacy) this.btnPrivacy.addEventListener('click', () => this.showPrivacyModal(true));
    if (this.btnClosePrivacy) this.btnClosePrivacy.addEventListener('click', () => this.showPrivacyModal(false));
    if (this.btnPrivacyOk) this.btnPrivacyOk.addEventListener('click', () => this.showPrivacyModal(false));

    // Eventos de Perfil (Nome e Foto)
    if (this.btnProfile) this.btnProfile.addEventListener('click', () => this.showProfileModal(true));
    if (this.btnCloseProfile) this.btnCloseProfile.addEventListener('click', () => this.showProfileModal(false));
    if (this.lobbyAvatarTrigger) this.lobbyAvatarTrigger.addEventListener('click', () => this.showProfileModal(true));
    if (this.btnQuickEditName) this.btnQuickEditName.addEventListener('click', () => this.showProfileModal(true));
    if (this.btnChooseAvatar) this.btnChooseAvatar.addEventListener('click', () => this.inputAvatarFile.click());
    if (this.inputAvatarFile) this.inputAvatarFile.addEventListener('change', (e) => this.handleAvatarFileSelect(e));
    if (this.btnRemoveAvatar) this.btnRemoveAvatar.addEventListener('click', () => this.handleAvatarRemove());
    if (this.btnSaveProfile) this.btnSaveProfile.addEventListener('click', () => this.handleSaveProfile());

    // Inicializa display do perfil na Home
    this.updateProfileDisplay();
  }

  // ==========================================
  // CONSTRUÇÃO DA INTERFACE (TABULEIRO & TECLADO)
  // ==========================================
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

        // Suporte a clique ou toque direto para focar tile específico
        tileDiv.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.handleTileClick(r, c);
        });

        rowDiv.appendChild(tileDiv);
      }
      this.boardElement.appendChild(rowDiv);
    }
    this.updateActiveTileHighlight();
  }

  handleTileClick(r, c) {
    if (this.isGameOver || !this.isMyTurn()) return;
    if (r !== this.currentRow) return; // Permite focar apenas nos tiles da linha da rodada atual

    this.currentTile = Math.max(0, Math.min(this.wordLength - 1, c));
    this.updateActiveTileHighlight();
  }

  updateActiveTileHighlight() {
    // Remove cursor ativo anterior de todos os tiles
    const allActive = this.boardElement.querySelectorAll('.tile.active-cursor');
    allActive.forEach(t => t.classList.remove('active-cursor'));

    const allRows = this.boardElement.querySelectorAll('.board-row');
    allRows.forEach(row => {
      if (parseInt(row.dataset.row, 10) === this.currentRow && this.isMyTurn() && !this.isGameOver) {
        row.classList.add('current-turn-row');
      } else {
        row.classList.remove('current-turn-row');
      }
    });

    if (this.isGameOver || !this.isMyTurn() || this.currentRow >= this.maxRows) return;

    // Destaca o tile atual selecionado
    const colToHighlight = Math.min(this.currentTile, this.wordLength - 1);
    const activeTile = this.getTileElement(this.currentRow, colToHighlight);
    if (activeTile) {
      activeTile.classList.add('active-cursor');
    }
  }

  moveToNextEmptyTile() {
    const rowLetters = this.boardMatrix[this.currentRow];
    // Procura a primeira vazia a partir do próximo slot ou volta para o início se necessário
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
      this.updateActiveTileHighlight();
    }
  }

  moveCursorLeft() {
    if (this.currentTile > 0) {
      this.currentTile--;
      this.updateActiveTileHighlight();
    }
  }

  moveCursorRight() {
    if (this.currentTile < this.wordLength - 1) {
      this.currentTile++;
      this.updateActiveTileHighlight();
    }
  }

  createKeyboard() {
    this.keyboardElement.innerHTML = '';
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

        btn.addEventListener('click', () => this.handleVirtualKeyPress(k));
        rowDiv.appendChild(btn);
      });

      this.keyboardElement.appendChild(rowDiv);
    });
  }

  // ==========================================
  // WEBRTC P2P CONEXÃO (MESMO MECANISMO RELATUM)
  // ==========================================
  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
  }

  handleCreateRoom() {
    this.role = 'host';
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.roomCode = code;
    const peerId = `termo-room-${code}`;

    this.btnCreateRoom.disabled = true;
    this.hostCodeDisplay.classList.remove('hidden');
    this.roomCodeVal.textContent = code;
    this.hostStatus.textContent = 'Inicializando rede P2P...';

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    try {
      this.peer = new Peer(peerId, {
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', (id) => {
        this.hostStatus.textContent = 'Aguardando adversário entrar...';
      });

      this.peer.on('connection', (conn) => {
        this.peerConn = conn;
        this.setupConnectionListeners(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        this.hostStatus.textContent = 'Erro ao criar sala. Tente outro código.';
        this.btnCreateRoom.disabled = false;
      });
    } catch (e) {
      this.hostStatus.textContent = 'Erro ao conectar no servidor WebRTC.';
      this.btnCreateRoom.disabled = false;
    }
  }

  handleJoinRoom() {
    const code = this.inputRoomCode.value.trim();
    if (!code || code.length < 6) {
      this.showToast('Digite um código de 6 dígitos');
      return;
    }

    this.role = 'guest';
    const targetPeerId = `termo-room-${code}`;

    this.joinStatus.classList.remove('hidden');
    this.joinStatus.textContent = 'Conectando ao oponente...';
    this.btnJoinRoom.disabled = true;

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    try {
      this.peer = new Peer({
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', () => {
        const conn = this.peer.connect(targetPeerId, { reliable: true });
        this.peerConn = conn;
        this.setupConnectionListeners(conn);

        conn.on('open', () => {
          this.joinStatus.textContent = 'Conectado! Iniciando jogo...';
          this.sendP2P({
            type: 'JOIN_GAME',
            name: this.myName,
            avatar: this.myAvatar
          });
        });
      });

      this.peer.on('error', (err) => {
        console.error('Guest peer error:', err);
        this.joinStatus.textContent = 'Sala não encontrada ou indisponível.';
        this.btnJoinRoom.disabled = false;
      });
    } catch (e) {
      this.joinStatus.textContent = 'Erro ao inicializar conexão.';
      this.btnJoinRoom.disabled = false;
    }
  }

  setupConnectionListeners(conn) {
    conn.on('data', (data) => {
      this.handleP2PMessage(data);
    });

    conn.on('close', () => {
      this.showToast('Oponente se desconectou.');
      setTimeout(() => this.resetToLobby(), 2500);
    });

    conn.on('error', (err) => {
      console.warn('P2P Conn error:', err);
    });
  }

  sendP2P(data) {
    if (this.peerConn && this.peerConn.open) {
      this.peerConn.send(data);
    }
  }

  handleP2PMessage(data) {
    switch (data.type) {
      case 'JOIN_GAME':
        if (this.role === 'host') {
          this.oppName = data.name || 'Jogador 2';
          this.oppAvatar = data.avatar || '';
          // O Host sorteia a palavra e envia para ambos
          const randomIndex = Math.floor(Math.random() * this.wordsList.length);
          const chosen = this.wordsList[randomIndex].normalized.toUpperCase();
          this.secretWord = chosen;
          this.currentTurnRole = 'host'; // Host começa

          this.sendP2P({
            type: 'START_MATCH',
            hostName: this.myName,
            hostAvatar: this.myAvatar,
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
        // Recebe o palpite jogado pelo oponente
        this.handleOpponentGuess(data.guess, data.evaluation, data.nextTurnRole, data.isWin, data.winnerRole);
        break;

      case 'TIME_EXPIRED':
        this.handleTimeExpiredByOpponent(data.timedOutRole, data.nextTurnRole);
        break;

      case 'SYNC_SCORE':
        if (typeof data.myScore === 'number' && typeof data.oppScore === 'number') {
          // Sincroniza os placares entre os pares
          this.oppScore = data.myScore;
          this.myScore = data.oppScore;
          this.updateScoreDisplay();
        }
        break;

      case 'SURRENDER':
        this.handleOpponentSurrender();
        break;

      case 'PLAY_AGAIN_REQUEST':
        this.showToast(`${this.oppName} quer jogar novamente!`);
        if (this.role === 'host') {
          const randomIndex = Math.floor(Math.random() * this.wordsList.length);
          this.secretWord = this.wordsList[randomIndex].normalized.toUpperCase();
          this.currentTurnRole = 'host';
          this.sendP2P({
            type: 'START_MATCH',
            hostName: this.myName,
            hostAvatar: this.myAvatar,
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

  copyRoomCode() {
    if (!this.roomCode) return;
    navigator.clipboard.writeText(this.roomCode).then(() => {
      this.btnCopyCode.textContent = 'Copiado! ✓';
      setTimeout(() => { this.btnCopyCode.textContent = 'Copiar Código'; }, 2000);
    });
  }

  // ==========================================
  // INICIALIZAÇÃO DE PARTIDAS
  // ==========================================
  startSoloGame() {
    this.role = 'solo';
    this.currentTurnRole = 'solo';
    this.myScore = 0;
    this.oppScore = 0;
    this.oppName = 'Computador';
    this.oppAvatar = '';
    const randomIndex = Math.floor(Math.random() * this.wordsList.length);
    this.secretWord = this.wordsList[randomIndex].normalized.toUpperCase();

    this.resetBoardState();
    this.lobbyScreen.classList.add('hidden');
    this.boardContainer.classList.remove('hidden');
    this.keyboardContainer.classList.remove('hidden');
    this.statusBar.classList.remove('hidden');
    if (this.btnSurrender) this.btnSurrender.classList.remove('hidden');

    this.updateStatusBar();
    this.showToast('Jogo Solo iniciado! Boa sorte!');
  }

  startMultiplayerMatch() {
    this.resetBoardState();
    this.lobbyScreen.classList.add('hidden');
    this.boardContainer.classList.remove('hidden');
    this.keyboardContainer.classList.remove('hidden');
    this.statusBar.classList.remove('hidden');
    if (this.btnSurrender) this.btnSurrender.classList.remove('hidden');

    this.updateStatusBar();
  }

  resetBoardState() {
    this.stopTurnTimer();
    this.currentRow = 0;
    this.currentTile = 0;
    this.isGameOver = false;
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));
    this.keyboardStatus = {};

    this.createBoard();
    this.createKeyboard();
    this.gameoverModal.classList.add('hidden');
  }

  isMyTurn() {
    if (this.role === 'solo') return true;
    return this.role === this.currentTurnRole;
  }

  updateStatusBar() {
    this.updateScoreDisplay();

    // Renderiza avatar e nome do Jogador 1 (Você)
    if (this.p1Badge) {
      const p1Label = this.role === 'host' ? `${this.myName} (Host)` : (this.role === 'solo' ? this.myName : this.myName);
      const p1NameEl = this.p1Badge.querySelector('.p-name');
      if (p1NameEl) p1NameEl.textContent = p1Label;
      this.renderAvatarElement(this.p1AvatarImg, this.p1AvatarPh, this.myAvatar);
    }

    if (this.role === 'solo') {
      this.p2Badge.classList.add('hidden');
      if (this.p2ScoreElement) this.p2ScoreElement.classList.add('hidden');
      if (this.scoreVsElement) this.scoreVsElement.classList.add('hidden');
      if (this.turnIndicator) {
        this.turnIndicator.textContent = `Tentativa ${this.currentRow + 1} de ${this.maxRows}`;
      }
      this.keyboardElement.classList.remove('locked');
      this.p1Badge.classList.remove('opponent-turn');
      this.p1Badge.classList.add('my-turn');
      this.startTurnTimer();
      return;
    }

    this.p2Badge.classList.remove('hidden');
    if (this.p2ScoreElement) this.p2ScoreElement.classList.remove('hidden');
    if (this.scoreVsElement) this.scoreVsElement.classList.remove('hidden');

    // Renderiza avatar e nome do Jogador 2 (Oponente)
    const p2Label = this.role === 'host' ? this.oppName : `${this.oppName} (Host)`;
    const p2NameEl = this.p2Badge.querySelector('.p-name');
    if (p2NameEl) p2NameEl.textContent = p2Label;
    this.renderAvatarElement(this.p2AvatarImg, this.p2AvatarPh, this.oppAvatar);

    const myTurn = this.isMyTurn();
    if (myTurn) {
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
    this.updateActiveTileHighlight();
    this.startTurnTimer();
  }

  renderAvatarElement(imgEl, phEl, avatarData) {
    if (!imgEl || !phEl) return;
    if (avatarData) {
      imgEl.src = avatarData;
      imgEl.classList.remove('hidden');
      phEl.classList.add('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
      phEl.classList.remove('hidden');
    }
  }

  updateScoreDisplay() {
    if (this.p1ScoreElement) this.p1ScoreElement.textContent = this.myScore;
    if (this.p2ScoreElement) this.p2ScoreElement.textContent = this.oppScore;
  }

  // ==========================================
  // GERENCIAMENTO DE PERFIL DO USUÁRIO
  // ==========================================
  updateProfileDisplay() {
    if (this.homePlayerName) this.homePlayerName.textContent = this.myName;
    this.renderAvatarElement(this.homeAvatarImg, this.homeAvatarPh, this.myAvatar);
    if (this.inputProfileName) this.inputProfileName.value = this.myName;
    this.updateModalAvatarPreview();
  }

  updateModalAvatarPreview() {
    this.renderAvatarElement(this.modalAvatarPreview, this.modalAvatarPlaceholder, this.tempAvatar);
    if (this.btnRemoveAvatar) {
      if (this.tempAvatar) {
        this.btnRemoveAvatar.classList.remove('hidden');
      } else {
        this.btnRemoveAvatar.classList.add('hidden');
      }
    }
  }

  showProfileModal(show) {
    if (!this.profileModal) return;
    if (show) {
      this.tempAvatar = this.myAvatar;
      if (this.inputProfileName) this.inputProfileName.value = this.myName;
      this.updateModalAvatarPreview();
      this.profileModal.classList.remove('hidden');
    } else {
      this.profileModal.classList.add('hidden');
    }
  }

  handleAvatarFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Por favor, selecione um arquivo de imagem.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensiona para avatar leve (128x128 max) em canvas
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Crop centralizado proporcional
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        this.tempAvatar = canvas.toDataURL('image/jpeg', 0.85);
        this.updateModalAvatarPreview();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Permite selecionar o mesmo arquivo novamente
  }

  handleAvatarRemove() {
    this.tempAvatar = '';
    this.updateModalAvatarPreview();
  }

  handleSaveProfile() {
    const newName = this.inputProfileName ? this.inputProfileName.value.trim() : '';
    this.myName = newName || 'Jogador 1';
    this.myAvatar = this.tempAvatar;

    try {
      localStorage.setItem('termo_player_name', this.myName);
      localStorage.setItem('termo_player_avatar', this.myAvatar);
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }

    this.updateProfileDisplay();
    this.showProfileModal(false);
    this.showToast('Perfil atualizado com sucesso! ✓');
  }

  // ==========================================
  // SISTEMA DE CRONÔMETRO DE TURNO (3 MINUTOS)
  // ==========================================
  startTurnTimer() {
    this.stopTurnTimer();
    if (this.isGameOver) {
      if (this.turnTimerElement) this.turnTimerElement.classList.add('hidden');
      return;
    }

    this.timeLeft = this.turnDuration;
    this.updateTimerDisplay();

    if (this.turnTimerElement) {
      this.turnTimerElement.classList.remove('hidden');
    }

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.updateTimerDisplay();
        this.handleTurnTimeout();
      } else {
        this.updateTimerDisplay();
      }
    }, 1000);
  }

  stopTurnTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.turnTimerElement) {
      this.turnTimerElement.classList.remove('warning');
    }
  }

  updateTimerDisplay() {
    if (!this.turnTimerElement) return;

    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.turnTimerElement.textContent = formatted;

    const myTurn = this.isMyTurn();
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

  handleTurnTimeout() {
    this.stopTurnTimer();
    if (this.isGameOver) return;

    if (this.role === 'solo') {
      this.showToast('Tempo esgotado!');
      this.clearUnsubmittedRow(this.currentRow);
      this.currentRow++;
      this.currentTile = 0;
      if (this.currentRow >= this.maxRows) {
        this.triggerGameOverLoss();
      } else {
        this.updateStatusBar();
      }
      return;
    }

    // Multiplayer: quem estiver no turno atual teve o tempo esgotado
    if (this.isMyTurn()) {
      const nextTurnRole = this.role === 'host' ? 'guest' : 'host';
      this.showToast('Tempo esgotado! Vez passada para o oponente.');
      this.clearUnsubmittedRow(this.currentRow);

      // Notifica o oponente via P2P
      this.sendP2P({
        type: 'TIME_EXPIRED',
        timedOutRole: this.role,
        nextTurnRole: nextTurnRole
      });

      this.currentTurnRole = nextTurnRole;
      this.updateStatusBar();
    }
  }

  handleTimeExpiredByOpponent(timedOutRole, nextTurnRole) {
    this.stopTurnTimer();
    this.clearUnsubmittedRow(this.currentRow);
    this.showToast(`Tempo de ${this.oppName} esgotou! Sua vez.`);
    this.currentTurnRole = nextTurnRole;
    this.updateStatusBar();
  }

  clearUnsubmittedRow(row) {
    if (row < 0 || row >= this.maxRows) return;
    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[row][c] = '';
      const tile = this.getTileElement(row, c);
      if (tile && !tile.classList.contains('flip')) {
        tile.textContent = '';
        tile.classList.remove('filled', 'opponent-typing', 'active-cursor');
      }
    }
    this.currentTile = 0;
  }

  // ==========================================
  // ENTRADA DE DADOS E PALPITES
  // ==========================================
  handlePhysicalKeyPress(e) {
    if (this.isGameOver || this.lobbyScreen.offsetParent !== null) return;
    if (this.helpModal.offsetParent !== null || this.gameoverModal.offsetParent !== null) return;

    if (!this.isMyTurn()) {
      this.showToast('Aguarde a vez do seu oponente!');
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
    if (this.isGameOver) return;
    if (!this.isMyTurn()) {
      this.showToast('Aguarde a vez do seu oponente!');
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
    if (this.currentRow >= this.maxRows) return;
    const col = Math.min(this.currentTile, this.wordLength - 1);
    if (col < 0 || col >= this.wordLength) return;

    this.boardMatrix[this.currentRow][col] = letter;
    const tileEl = this.getTileElement(this.currentRow, col);
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
    this.updateActiveTileHighlight();

    if (this.role !== 'solo') {
      this.sendP2P({
        type: 'LIVE_KEYSTROKE',
        action: 'ADD',
        letter: letter,
        row: this.currentRow,
        col: col
      });
    }
  }

  deleteLetter() {
    if (this.currentRow >= this.maxRows) return;

    // Se estiver após o último tile (fim da linha), apaga o último
    let col = this.currentTile;
    if (col >= this.wordLength) {
      col = this.wordLength - 1;
      this.currentTile = col;
    } else if (this.boardMatrix[this.currentRow][col] === '') {
      // Se a posição atual já estiver vazia, apaga a anterior
      if (col > 0) {
        col--;
        this.currentTile = col;
      }
    }

    this.boardMatrix[this.currentRow][col] = '';
    const tileEl = this.getTileElement(this.currentRow, col);
    if (tileEl) {
      tileEl.textContent = '';
      tileEl.classList.remove('filled', 'opponent-typing');
    }
    this.updateActiveTileHighlight();

    if (this.role !== 'solo') {
      this.sendP2P({
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
        const tileEl = this.getTileElement(targetRow, targetCol);
        if (tileEl) {
          tileEl.textContent = letter;
          tileEl.classList.add('filled', 'opponent-typing');
        }
        this.currentTile = targetCol + 1;
      }
    } else if (action === 'DELETE') {
      if (targetCol >= 0 && targetCol < this.wordLength && targetRow < this.maxRows) {
        this.boardMatrix[targetRow][targetCol] = '';
        const tileEl = this.getTileElement(targetRow, targetCol);
        if (tileEl) {
          tileEl.textContent = '';
          tileEl.classList.remove('filled', 'opponent-typing');
        }
        this.currentTile = targetCol;
      }
    }
  }

  getTileElement(r, c) {
    return this.boardElement.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
  }

  getRowElement(r) {
    return this.boardElement.querySelector(`.board-row[data-row="${r}"]`);
  }

  // ==========================================
  // REGRAS DE VALIDAÇÃO DO TERMO & REVEAL
  // ==========================================
  submitCurrentRow() {
    const letters = this.boardMatrix[this.currentRow];
    const isComplete = letters.every(l => l && l.trim().length === 1);
    if (!isComplete) {
      this.shakeCurrentRow();
      this.showToast('Palavra incompleta');
      return;
    }

    const guess = letters.join('');

    // Validação de existência no banco de dados / dicionário
    if (!this.validWordsSet.has(guess)) {
      this.shakeCurrentRow();
      this.showToast('Essa palavra não existe em nosso banco de dados');
      return;
    }

    const evaluation = this.evaluateGuess(guess, this.secretWord);
    const isWin = evaluation.every(s => s === 'correct');
    const nextTurnRole = this.role === 'host' ? 'guest' : 'host';

    this.stopTurnTimer();

    // Bloqueia temporariamente para a animação
    this.keyboardElement.classList.add('locked');

    // Executa a revelação com a animação flip idêntica
    this.animateRowReveal(this.currentRow, guess, evaluation, () => {
      if (isWin) {
        this.triggerWin(this.myName, true);
        if (this.role !== 'solo') {
          this.sendP2P({
            type: 'SUBMIT_GUESS',
            guess: guess,
            evaluation: evaluation,
            nextTurnRole: nextTurnRole,
            isWin: true,
            winnerRole: this.role
          });
        }
      } else {
        this.currentRow++;
        this.currentTile = 0;

        if (this.currentRow >= this.maxRows) {
          // Empate / derrota após 6 tentativas
          this.triggerGameOverLoss();
          if (this.role !== 'solo') {
            this.sendP2P({
              type: 'SUBMIT_GUESS',
              guess: guess,
              evaluation: evaluation,
              nextTurnRole: nextTurnRole,
              isWin: false,
              winnerRole: null
            });
          }
        } else {
          // Passa a vez
          if (this.role !== 'solo') {
            this.currentTurnRole = nextTurnRole;
            this.sendP2P({
              type: 'SUBMIT_GUESS',
              guess: guess,
              evaluation: evaluation,
              nextTurnRole: nextTurnRole,
              isWin: false,
              winnerRole: null
            });
          }
          this.updateStatusBar();
        }
      }
    });
  }

  // Quando o oponente joga
  handleOpponentGuess(guess, evaluation, nextTurnRole, isWin, winnerRole) {
    this.stopTurnTimer();
    const opponentRow = this.currentRow;
    const rowEl = this.getRowElement(opponentRow);
    if (rowEl) {
      rowEl.classList.add('opponent-row');
    }

    // Escreve a palavra do oponente na linha atual
    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[opponentRow][c] = guess[c];
      const tile = this.getTileElement(opponentRow, c);
      tile.textContent = guess[c];
      tile.classList.add('filled');
    }

    this.animateRowReveal(opponentRow, guess, evaluation, () => {
      if (isWin) {
        this.triggerWin(this.oppName, false);
      } else {
        this.currentRow++;
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

  // Algoritmo clássico do Termo para gerenciar letras duplicadas
  evaluateGuess(guess, secret) {
    const result = Array(this.wordLength).fill('absent');
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    // 1ª passada: Verificar letras corretas (Verdes)
    for (let i = 0; i < this.wordLength; i++) {
      if (guessArr[i] === secretArr[i]) {
        result[i] = 'correct';
        secretArr[i] = null;
        guessArr[i] = null;
      }
    }

    // 2ª passada: Verificar letras existentes mas em outra posição (Amarelas)
    for (let i = 0; i < this.wordLength; i++) {
      if (guessArr[i] !== null) {
        const foundIndex = secretArr.indexOf(guessArr[i]);
        if (foundIndex !== -1) {
          result[i] = 'present';
          secretArr[foundIndex] = null;
        }
      }
    }

    return result;
  }

  // ==========================================
  // ANIMAÇÃO DE REVELAÇÃO (FLIP EXATO DO TERMO)
  // ==========================================
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
          if (status === 'correct' || status === 'present') {
            this.playFeedbackSound(status);
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

  // Atualiza as cores do teclado virtual respeitando a precedência: correct > present > absent
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

  shakeCurrentRow() {
    const rowEl = this.getRowElement(this.currentRow);
    if (rowEl) {
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth; // Force reflow
      rowEl.classList.add('shake');
    }
  }

  showToast(msg) {
    this.toastMessage.textContent = msg;
    this.toastMessage.classList.remove('hidden');
    // Animação CSS dura 2.2s
    setTimeout(() => {
      this.toastMessage.classList.add('hidden');
    }, 2200);
  }

  // ==========================================
  // FINAL DE PARTIDA & MODAIS
  // ==========================================
  triggerWin(winnerName, isMe) {
    this.stopTurnTimer();
    this.isGameOver = true;

    if (isMe) {
      this.myScore++;
    } else {
      this.oppScore++;
    }
    this.updateScoreDisplay();

    // Animação de pulo (bounce) nas letras vencedoras
    const winRow = this.currentRow;
    for (let c = 0; c < this.wordLength; c++) {
      const tile = this.getTileElement(winRow, c);
      setTimeout(() => {
        tile.classList.add('bounce');
      }, c * 100);
    }

    if (window.confetti && isMe) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    setTimeout(() => {
      this.goTitle.textContent = isMe ? '🏆 VITÓRIA!' : 'DERROTA!';
      this.goTitle.style.color = isMe ? 'var(--color-correct)' : 'var(--color-present)';
      this.goSubtitle.textContent = isMe ? 'Você acertou a palavra secreta!' : `${winnerName} acertou a palavra primeiro!`;
      this.goSecretWord.textContent = this.secretWord;
      this.goWinnerName.textContent = winnerName;
      this.goAttemptsCount.textContent = `${this.currentRow + 1}/${this.maxRows}`;
      this.gameoverModal.classList.remove('hidden');
    }, 1800);
  }

  triggerGameOverLoss() {
    this.stopTurnTimer();
    this.isGameOver = true;
    setTimeout(() => {
      this.goTitle.textContent = 'FIM DE JOGO';
      this.goTitle.style.color = '#fff';
      this.goSubtitle.textContent = 'Ninguém acertou em 6 tentativas.';
      this.goSecretWord.textContent = this.secretWord;
      this.goWinnerName.textContent = 'Empate';
      this.goAttemptsCount.textContent = `6/${this.maxRows}`;
      this.gameoverModal.classList.remove('hidden');
    }, 1200);
  }

  handleSurrender() {
    if (this.isGameOver) return;
    this.stopTurnTimer();

    this.oppScore++;
    this.updateScoreDisplay();

    if (this.role === 'solo') {
      this.isGameOver = true;
      this.goTitle.textContent = 'DERROTA!';
      this.goTitle.style.color = 'var(--color-present)';
      this.goSubtitle.textContent = 'Você desistiu da partida.';
      this.goSecretWord.textContent = this.secretWord;
      this.goWinnerName.textContent = 'Computador';
      this.goAttemptsCount.textContent = `${this.currentRow}/${this.maxRows}`;
      this.gameoverModal.classList.remove('hidden');
      return;
    }

    // Multiplayer: desistência do próprio jogador
    this.sendP2P({ type: 'SURRENDER' });
    this.isGameOver = true;
    this.goTitle.textContent = 'DERROTA!';
    this.goTitle.style.color = 'var(--color-present)';
    this.goSubtitle.textContent = 'Você desistiu da partida.';
    this.goSecretWord.textContent = this.secretWord;
    this.goWinnerName.textContent = this.oppName;
    this.goAttemptsCount.textContent = `${this.currentRow}/${this.maxRows}`;
    this.gameoverModal.classList.remove('hidden');
  }

  handleOpponentSurrender() {
    if (this.isGameOver) return;
    this.stopTurnTimer();
    this.isGameOver = true;

    this.myScore++;
    this.updateScoreDisplay();

    if (window.confetti) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    this.goTitle.textContent = '🏆 VITÓRIA!';
    this.goTitle.style.color = 'var(--color-correct)';
    this.goSubtitle.textContent = `${this.oppName} desistiu da partida!`;
    this.goSecretWord.textContent = this.secretWord;
    this.goWinnerName.textContent = this.myName;
    this.goAttemptsCount.textContent = `${this.currentRow}/${this.maxRows}`;
    this.gameoverModal.classList.remove('hidden');
  }

  handlePlayAgainRequest() {
    if (this.role === 'solo') {
      this.startSoloGame();
    } else {
      this.sendP2P({ type: 'PLAY_AGAIN_REQUEST' });
      this.showToast('Pedido enviado ao oponente...');
      if (this.role === 'host') {
        const randomIndex = Math.floor(Math.random() * this.wordsList.length);
        this.secretWord = this.wordsList[randomIndex].normalized.toUpperCase();
        this.currentTurnRole = 'host';
        this.sendP2P({
          type: 'START_MATCH',
          hostName: this.myName,
          hostAvatar: this.myAvatar,
          secretWord: this.secretWord,
          startingRole: 'host'
        });
        this.resetBoardState();
        this.startMultiplayerMatch();
      }
    }
  }

  resetToLobby() {
    this.stopTurnTimer();
    this.isGameOver = true;
    this.myScore = 0;
    this.oppScore = 0;
    this.updateScoreDisplay();
    if (this.peerConn) {
      try { this.peerConn.close(); } catch (e) {}
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    this.role = 'solo';
    this.peerConn = null;
    this.peer = null;

    this.gameoverModal.classList.add('hidden');
    if (this.privacyModal) this.privacyModal.classList.add('hidden');
    this.helpModal.classList.add('hidden');
    this.boardContainer.classList.add('hidden');
    this.keyboardContainer.classList.add('hidden');
    this.statusBar.classList.add('hidden');
    if (this.btnSurrender) this.btnSurrender.classList.add('hidden');
    this.hostCodeDisplay.classList.add('hidden');
    this.joinStatus.classList.add('hidden');
    this.btnCreateRoom.disabled = false;
    this.btnJoinRoom.disabled = false;

    this.lobbyScreen.classList.remove('hidden');
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
}

// Inicializa o jogo ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  window.termoGame = new TermoMultiplayerGame();
});

