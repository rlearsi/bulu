/**
 * Módulo de Layout Multigrade (modos Cruzado e Individual)
 * Organiza o tabuleiro do jogador local (o mesmo elemento #board usado pelo modo Normal) e as
 * grades miniatura dos oponentes lado a lado:
 *  - 2 jogadores: [ você | oponente ]
 *  - 3 jogadores: você à esquerda (maior) e dois oponentes empilhados à direita
 *  - 4 jogadores: grade 2x2 (você no canto superior esquerdo)
 */

export class MultiBoardLayout {
  constructor({ ui, wordLength = 5 }) {
    this.ui = ui;
    this.wordLength = wordLength;
    this.root = null;
    this.ownSlot = null;
    this.minis = new Map(); // id -> { slot, label, board, tiles[row][col] }
    this.myId = '';
    this.maxRows = 6;
  }

  get isMounted() {
    return Boolean(this.root);
  }

  /**
   * @param {object} opts
   * @param {Array<{id:string,name:string}>} opts.players Jogadores na ordem da sala
   * @param {string} opts.myId
   * @param {number} opts.maxRows Linhas de cada grade
   */
  mount({ players, myId, maxRows }) {
    this.unmount();
    this.myId = myId;
    this.maxRows = maxRows;

    const container = this.ui.boardContainer;
    this.root = document.createElement('div');
    this.root.id = 'mm-layout';
    this.root.className = 'mm-layout';
    this.root.style.setProperty('--rows', maxRows);
    container.insertBefore(this.root, this.ui.boardElement);
    container.classList.add('mm-active');

    const me = players.find(p => p.id === myId) || { id: myId, name: 'Você' };
    const others = players.filter(p => p.id !== myId);

    this.ownSlot = this.createSlot('Você', true);
    this.ownSlot.slot.dataset.id = me.id;
    this.ownSlot.area.appendChild(this.ui.boardElement);
    this.ui.boardElement.style.setProperty('--rows', maxRows);
    this.ui.boardElement.classList.add('mm-own');
    this.root.appendChild(this.ownSlot.slot);

    others.forEach((p) => {
      const parts = this.createSlot(p.name, false);
      parts.slot.dataset.id = p.id;
      const { board, tiles } = this.buildMiniBoard();
      parts.area.appendChild(board);
      this.minis.set(p.id, { ...parts, board, tiles });
      this.root.appendChild(parts.slot);
    });

    this.updateLayoutClass();
  }

  unmount() {
    if (!this.root) return;
    const container = this.ui.boardContainer;
    this.ui.boardElement.classList.remove('mm-own');
    container.insertBefore(this.ui.boardElement, this.root);
    this.root.remove();
    container.classList.remove('mm-active');
    this.root = null;
    this.ownSlot = null;
    this.minis.clear();
  }

  createSlot(name, isOwn) {
    const slot = document.createElement('div');
    slot.className = `mm-slot${isOwn ? ' mm-slot-own' : ''}`;
    const label = document.createElement('span');
    label.className = 'mm-label';
    label.textContent = name;
    const area = document.createElement('div');
    area.className = 'mm-area';
    area.appendChild(label);
    slot.appendChild(area);
    return { slot, label, area };
  }

  buildMiniBoard() {
    const board = document.createElement('div');
    board.className = 'board mm-mini';
    board.style.setProperty('--rows', this.maxRows);
    board.style.gridTemplateRows = `repeat(${this.maxRows}, 1fr)`;
    const tiles = [];
    for (let r = 0; r < this.maxRows; r++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'board-row';
      const rowTiles = [];
      for (let c = 0; c < this.wordLength; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        rowDiv.appendChild(tile);
        rowTiles.push(tile);
      }
      tiles.push(rowTiles);
      board.appendChild(rowDiv);
    }
    return { board, tiles };
  }

  updateLayoutClass() {
    if (!this.root) return;
    const count = 1 + this.minis.size;
    this.root.classList.remove('n2', 'n3', 'n4');
    this.root.classList.add(`n${Math.max(2, Math.min(4, count))}`);
  }

  /** Atualiza os nomes exibidos acima de cada grade. */
  updateLabels(players, myId) {
    players.forEach((p) => {
      if (p.id === myId) return;
      const mini = this.minis.get(p.id);
      if (mini) mini.label.textContent = p.name;
    });
  }

  /** Esmaece as grades de quem não está jogando. Sem turnId (modo Individual), nenhuma é esmaecida. */
  setActive(turnId) {
    if (!this.root) return;
    const set = (slot, id) => slot.classList.toggle('inactive', Boolean(turnId) && id !== turnId);
    if (this.ownSlot) set(this.ownSlot.slot, this.myId);
    this.minis.forEach((m, id) => set(m.slot, id));
  }

  /** Destaca ou limpa o tile selecionado pelo oponente. */
  setOpponentCursor(cursor, mode = 'cross') {
    if (!this.root) return;
    this.root.querySelectorAll('.tile.opponent-cursor').forEach(t => t.classList.remove('opponent-cursor'));
    if (!cursor || typeof cursor.row !== 'number' || typeof cursor.col !== 'number') return;

    if (mode === 'cross') {
      this.minis.forEach((m) => {
        const t = m.tiles[cursor.row] && m.tiles[cursor.row][cursor.col];
        if (t) t.classList.add('opponent-cursor');
      });
    } else if (cursor.from && this.minis.has(cursor.from)) {
      const m = this.minis.get(cursor.from);
      const t = m.tiles[cursor.row] && m.tiles[cursor.row][cursor.col];
      if (t) t.classList.add('opponent-cursor');
    }
  }

  /** Espelha as letras digitadas (sem avaliação) da linha atual nas grades dos oponentes. */
  mirrorRow(row, letters, showLetters = true) {
    this.minis.forEach((m) => {
      const rowTiles = m.tiles[row];
      if (!rowTiles) return;
      for (let c = 0; c < this.wordLength; c++) {
        const tile = rowTiles[c];
        if (tile.classList.contains('correct') || tile.classList.contains('present') || tile.classList.contains('absent')) continue;
        const letter = (letters && letters[c]) || '';
        tile.textContent = showLetters ? letter : '';
        tile.classList.toggle('filled', Boolean(letter));
        tile.classList.toggle('opponent-typing', Boolean(letter));
      }
    });
  }

  /** Revela (com animação de virada) uma linha na grade de um oponente. */
  revealRow(id, row, guess, evaluation, showLetters = true) {
    const mini = this.minis.get(id);
    if (!mini || !mini.tiles[row]) return;
    const flipDuration = 550;
    const staggerDelay = 280;

    for (let c = 0; c < this.wordLength; c++) {
      const tile = mini.tiles[row][c];
      setTimeout(() => {
        tile.classList.remove('opponent-typing');
        tile.classList.add('flip');
        setTimeout(() => {
          tile.textContent = showLetters ? guess[c] : '';
          tile.classList.add('filled', evaluation[c]);
        }, flipDuration / 2);
      }, c * staggerDelay);
    }
  }

  removeBoard(id) {
    const mini = this.minis.get(id);
    if (!mini) return;
    mini.slot.remove();
    this.minis.delete(id);
    this.updateLayoutClass();
  }
}

