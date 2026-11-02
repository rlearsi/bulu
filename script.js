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
    this.myName = 'Jogador 1';
    this.oppName = 'Oponente';
    this.currentTurnRole = 'host'; // Quem joga agora ('host' ou 'guest' ou 'solo')

    // Matriz de letras no tabuleiro [linha][coluna]
    this.boardMatrix = Array.from({ length: this.maxRows }, () => Array(this.wordLength).fill(''));
    // Status das letras no teclado: { 'A': 'correct' | 'present' | 'absent' }
    this.keyboardStatus = {};

    this.initDOM();
    this.initEvents();
    this.createBoard();
    this.createKeyboard();
    this.loadWordsDatabase();
  }

  // Carrega palavras do JSON caso disponível
  async loadWordsDatabase() {
    try {
      const res = await fetch('words.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.wordsList = data;
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
    this.turnIndicator = document.getElementById('turn-indicator');
    this.toastMessage = document.getElementById('toast-message');

    // Badges jogadores
    this.p1Badge = document.getElementById('p1-badge');
    this.p2Badge = document.getElementById('p2-badge');
    this.playerNicknameInput = document.getElementById('player-nickname');

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
    this.btnPlayAgain.addEventListener('click', () => this.handlePlayAgainRequest());
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
        rowDiv.appendChild(tileDiv);
      }
      this.boardElement.appendChild(rowDiv);
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
    this.myName = this.playerNicknameInput.value.trim() || 'Jogador 1';
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

    this.myName = this.playerNicknameInput.value.trim() || 'Jogador 2';
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
            name: this.myName
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
          // O Host sorteia a palavra e envia para ambos
          const randomIndex = Math.floor(Math.random() * this.wordsList.length);
          const chosen = this.wordsList[randomIndex].normalized.toUpperCase();
          this.secretWord = chosen;
          this.currentTurnRole = 'host'; // Host começa

          this.sendP2P({
            type: 'START_MATCH',
            hostName: this.myName,
            secretWord: this.secretWord,
            startingRole: 'host'
          });

          this.startMultiplayerMatch();
        }
        break;

      case 'START_MATCH':
        if (this.role === 'guest') {
          this.oppName = data.hostName || 'Jogador 1';
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

      case 'PLAY_AGAIN_REQUEST':
        this.showToast(`${this.oppName} quer jogar novamente!`);
        if (this.role === 'host') {
          const randomIndex = Math.floor(Math.random() * this.wordsList.length);
          this.secretWord = this.wordsList[randomIndex].normalized.toUpperCase();
          this.currentTurnRole = 'host';
          this.sendP2P({
            type: 'START_MATCH',
            hostName: this.myName,
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
    this.myName = this.playerNicknameInput.value.trim() || 'Você';
    this.currentTurnRole = 'solo';
    const randomIndex = Math.floor(Math.random() * this.wordsList.length);
    this.secretWord = this.wordsList[randomIndex].normalized.toUpperCase();
    this.oppName = 'Computador';

    this.resetBoardState();
    this.lobbyScreen.classList.add('hidden');
    this.boardContainer.classList.remove('hidden');
    this.keyboardContainer.classList.remove('hidden');
    this.statusBar.classList.remove('hidden');

    this.updateStatusBar();
    this.showToast('Jogo Solo iniciado! Boa sorte!');
  }

  startMultiplayerMatch() {
    this.resetBoardState();
    this.lobbyScreen.classList.add('hidden');
    this.boardContainer.classList.remove('hidden');
    this.keyboardContainer.classList.remove('hidden');
    this.statusBar.classList.remove('hidden');

    this.updateStatusBar();
    if (this.isMyTurn()) {
      this.showToast(`É a sua vez de jogar!`);
    } else {
      this.showToast(`Vez de ${this.oppName}!`);
    }
  }

  resetBoardState() {
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
    if (this.role === 'solo') {
      this.p1Badge.querySelector('.p-name').textContent = this.myName;
      this.p2Badge.classList.add('hidden');
      this.turnIndicator.textContent = `Tentativa ${this.currentRow + 1} de ${this.maxRows}`;
      this.keyboardElement.classList.remove('locked');
      this.p1Badge.classList.add('active-turn');
      return;
    }

    this.p2Badge.classList.remove('hidden');
    this.p1Badge.querySelector('.p-name').textContent = `${this.myName} (${this.role === 'host' ? 'Host' : 'Guest'})`;
    this.p2Badge.querySelector('.p-name').textContent = `${this.oppName} (${this.role === 'host' ? 'Guest' : 'Host'})`;

    const myTurn = this.isMyTurn();
    if (myTurn) {
      this.turnIndicator.textContent = '🟢 SUA VEZ DE JOGAR';
      this.p1Badge.classList.add('active-turn');
      this.p2Badge.classList.remove('active-turn');
      this.keyboardElement.classList.remove('locked');
    } else {
      this.turnIndicator.textContent = `⏳ VEZ DE ${this.oppName.toUpperCase()} (BLOQUEADO)`;
      this.p1Badge.classList.remove('active-turn');
      this.p2Badge.classList.add('active-turn');
      this.keyboardElement.classList.add('locked');
    }
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
    if (this.currentTile >= this.wordLength || this.currentRow >= this.maxRows) return;

    const col = this.currentTile;
    this.boardMatrix[this.currentRow][col] = letter;
    const tileEl = this.getTileElement(this.currentRow, col);
    tileEl.textContent = letter;
    tileEl.classList.remove('opponent-typing');
    tileEl.classList.add('filled');
    this.currentTile++;

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
    if (this.currentTile <= 0) return;

    this.currentTile--;
    const col = this.currentTile;
    this.boardMatrix[this.currentRow][col] = '';
    const tileEl = this.getTileElement(this.currentRow, col);
    tileEl.textContent = '';
    tileEl.classList.remove('filled', 'opponent-typing');

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
    if (this.currentTile < this.wordLength) {
      this.shakeCurrentRow();
      this.showToast('Palavra incompleta');
      return;
    }

    const guess = this.boardMatrix[this.currentRow].join('');
    const evaluation = this.evaluateGuess(guess, this.secretWord);
    const isWin = evaluation.every(s => s === 'correct');
    const nextTurnRole = this.role === 'host' ? 'guest' : 'host';

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
    // Escreve a palavra do oponente na linha atual
    for (let c = 0; c < this.wordLength; c++) {
      this.boardMatrix[this.currentRow][c] = guess[c];
      const tile = this.getTileElement(this.currentRow, c);
      tile.textContent = guess[c];
      tile.classList.add('filled');
    }

    this.animateRowReveal(this.currentRow, guess, evaluation, () => {
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
    this.isGameOver = true;

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
          secretWord: this.secretWord,
          startingRole: 'host'
        });
        this.resetBoardState();
        this.startMultiplayerMatch();
      }
    }
  }

  resetToLobby() {
    this.isGameOver = true;
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
    this.helpModal.classList.add('hidden');
    this.boardContainer.classList.add('hidden');
    this.keyboardContainer.classList.add('hidden');
    this.statusBar.classList.add('hidden');
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
}

// Inicializa o jogo ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  window.termoGame = new TermoMultiplayerGame();
});

