/**
 * Módulo de Rede P2P (WebRTC / PeerJS)
 * Responsável exclusivamente por criar salas (privadas e públicas), listar salas públicas abertas, conectar pares e enviar/receber pacotes WebRTC.
 *
 * Topologia em estrela: o host mantém uma conexão com cada convidado e retransmite
 * as mensagens dos convidados para os demais. Se o host sair, um convidado pode
 * assumir o papel de host (becomeHost) e os outros se reconectam a ele (reconnectToHost).
 */

const PUBLIC_SLOT_PREFIX = 'termo-duelo-public-';
const MAX_PUBLIC_SLOTS = 10;

export class P2PNetwork {
  /**
   * @param {object} opts
   * @param {(data: object, fromId: string) => void} opts.onMessage
   * @param {(peerId: string) => void} opts.onPeerLeft      Host: um convidado desconectou
   * @param {(hostId: string) => void} opts.onHostLost       Convidado: conexão com o host caiu
   * @param {() => void} opts.onJoinRejected                 Convidado: host recusou (sala cheia/em jogo)
   * @param {(data: object, peerId: string) => boolean} opts.acceptJoin  Host: aceita JOIN_GAME / REJOIN?
   * @param {() => object} opts.getRoomInfo                  Host: dados para listagem pública
   */
  constructor({ onMessage, onPeerLeft, onHostLost, onJoinRejected, acceptJoin, getRoomInfo }) {
    this.peer = null;
    this.isHost = false;
    this.conns = new Map(); // Host: peerId -> DataConnection
    this.hostConn = null;   // Convidado: conexão com o host
    this.scannerPeer = null;
    this.roomCode = '';
    this.publicSlotId = '';
    this.isPublicRoom = false;
    this.onMessage = onMessage;
    this.onPeerLeft = onPeerLeft;
    this.onHostLost = onHostLost;
    this.onJoinRejected = onJoinRejected;
    this.acceptJoin = acceptJoin;
    this.getRoomInfo = getRoomInfo;
  }

  get myId() {
    return this.peer ? this.peer.id : '';
  }

  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'stun:stun.nextcloud.com:443' }
    ];
  }

  isConnected() {
    if (this.isHost) {
      for (const conn of this.conns.values()) {
        if (conn.open) return true;
      }
      return false;
    }
    return Boolean(this.hostConn && this.hostConn.open);
  }

  // ==========================================
  // HOST
  // ==========================================
  createRoom({ onOpen, onError }) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.destroy();
    this.roomCode = code;
    this.publicSlotId = '';
    this.isPublicRoom = false;
    this.isHost = true;
    const peerId = `termo-room-${code}`;

    try {
      this.peer = new Peer(peerId, {
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', (id) => {
        if (onOpen) onOpen(code, id);
      });

      this.peer.on('connection', (conn) => this.setupIncomingConnection(conn));

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (onError) onError(err);
      });
    } catch (e) {
      if (onError) onError(e);
    }

    return code;
  }

  createPublicRoom({ onOpen, onError }) {
    this.destroy();
    this.roomCode = '';
    this.isPublicRoom = true;
    this.isHost = true;

    const trySlot = (slotIndex) => {
      if (slotIndex > MAX_PUBLIC_SLOTS) {
        if (onError) onError(new Error('Todas as vagas públicas estão ocupadas no momento.'));
        return;
      }

      const slotId = `${PUBLIC_SLOT_PREFIX}${slotIndex}`;
      try {
        const candidatePeer = new Peer(slotId, {
          config: { iceServers: this.getIceServers() }
        });

        let opened = false;

        candidatePeer.on('open', (id) => {
          opened = true;
          this.peer = candidatePeer;
          this.publicSlotId = id;
          if (onOpen) onOpen(id);
        });

        candidatePeer.on('connection', (conn) => this.setupIncomingConnection(conn));

        candidatePeer.on('error', (err) => {
          if (!opened && err && err.type === 'unavailable-id') {
            try { candidatePeer.destroy(); } catch (e) {}
            trySlot(slotIndex + 1);
            return;
          }
          console.error('Public peer error:', err);
          if (!opened && onError) onError(err);
        });
      } catch (e) {
        if (onError) onError(e);
      }
    };

    trySlot(1);
  }

  /** Conexões recebidas (host original ou convidado promovido a host). */
  setupIncomingConnection(conn) {
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      // Consulta de listagem de salas públicas abertas
      if (data.type === 'QUERY_ROOM_INFO') {
        const info = this.getRoomInfo ? this.getRoomInfo() : null;
        if (this.isHost && info && info.joinable) {
          conn.send({
            type: 'PUBLIC_ROOM_INFO',
            slotId: this.publicSlotId,
            hostName: info.hostName || 'Jogador 1',
            hostAvatar: info.hostAvatar || '',
            count: info.count || 1,
            max: info.max || 2,
            mode: info.mode || 'normal'
          });
        } else {
          conn.send({ type: 'ROOM_BUSY' });
        }
        return;
      }

      // Jogador entrando (ou reconectando após migração de host)
      if (data.type === 'JOIN_GAME' || data.type === 'REJOIN') {
        const accepted = this.isHost && this.acceptJoin && this.acceptJoin(data, conn.peer);
        if (!accepted) {
          conn.send({ type: 'ROOM_BUSY' });
          setTimeout(() => {
            try { conn.close(); } catch (e) {}
          }, 150);
          return;
        }

        this.conns.set(conn.peer, conn);
        conn.on('close', () => {
          if (this.conns.get(conn.peer) === conn) {
            this.conns.delete(conn.peer);
            if (this.onPeerLeft) this.onPeerLeft(conn.peer);
          }
        });
        conn.on('error', (err) => {
          console.warn('P2P Conn error:', err);
        });

        if (this.onMessage) this.onMessage(data, conn.peer);
        return;
      }

      // Demais mensagens da partida: retransmite aos outros convidados e processa localmente
      if (this.conns.get(conn.peer) === conn) {
        const stamped = { ...data, from: conn.peer };
        this.broadcast(stamped, conn.peer);
        if (this.onMessage) this.onMessage(stamped, conn.peer);
      }
    });
  }

  /** Convidado assume o papel de host após a saída do host original. */
  becomeHost() {
    this.isHost = true;
    this.hostConn = null;
    this.roomCode = '';
    this.publicSlotId = '';
    this.isPublicRoom = false;
  }

  removePeer(peerId) {
    const conn = this.conns.get(peerId);
    this.conns.delete(peerId);
    if (conn) {
      try { conn.close(); } catch (e) {}
    }
  }

  // ==========================================
  // LISTAGEM DE SALAS PÚBLICAS
  // ==========================================
  scanPublicRooms({ onRoomFound, onComplete }) {
    this.destroyScanner();

    const foundRooms = [];
    const pendingSlots = new Set();
    for (let i = 1; i <= MAX_PUBLIC_SLOTS; i++) {
      pendingSlots.add(`${PUBLIC_SLOT_PREFIX}${i}`);
    }

    let finished = false;
    let timeoutId = null;

    const finishScan = () => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      this.destroyScanner();
      if (onComplete) onComplete(foundRooms);
    };

    const markSlotDone = (slotId) => {
      pendingSlots.delete(slotId);
      if (pendingSlots.size === 0) {
        finishScan();
      }
    };

    try {
      const scanner = new Peer({
        config: { iceServers: this.getIceServers() }
      });
      this.scannerPeer = scanner;

      timeoutId = setTimeout(() => {
        finishScan();
      }, 2400);

      scanner.on('open', () => {
        for (let i = 1; i <= MAX_PUBLIC_SLOTS; i++) {
          const slotId = `${PUBLIC_SLOT_PREFIX}${i}`;
          const conn = scanner.connect(slotId, { reliable: true });

          conn.on('open', () => {
            conn.send({ type: 'QUERY_ROOM_INFO' });
          });

          conn.on('data', (data) => {
            if (data && data.type === 'PUBLIC_ROOM_INFO' && data.slotId) {
              const roomInfo = {
                slotId: data.slotId,
                hostName: data.hostName || 'Jogador',
                hostAvatar: data.hostAvatar || '',
                count: data.count || 1,
                max: data.max || 2,
                mode: data.mode || 'normal'
              };
              foundRooms.push(roomInfo);
              if (!finished && onRoomFound) {
                onRoomFound(roomInfo);
              }
            }
            try { conn.close(); } catch (e) {}
            markSlotDone(slotId);
          });

          conn.on('error', () => {
            markSlotDone(slotId);
          });
        }
      });

      scanner.on('error', (err) => {
        if (err && err.type === 'peer-unavailable' && typeof err.message === 'string') {
          const match = err.message.match(/(termo-duelo-public-\d+)/);
          if (match && match[1]) {
            markSlotDone(match[1]);
            return;
          }
        }
      });
    } catch (e) {
      finishScan();
    }
  }

  // ==========================================
  // CONVIDADO
  // ==========================================
  joinRoom(code, { onConnected, onError }) {
    const targetPeerId = `termo-room-${code}`;
    this.connectToTargetPeer(targetPeerId, { onConnected, onError });
  }

  joinPublicRoom(slotId, { onConnected, onError }) {
    this.connectToTargetPeer(slotId, { onConnected, onError });
  }

  connectToTargetPeer(targetPeerId, { onConnected, onError }) {
    this.destroy();
    this.isHost = false;

    try {
      this.peer = new Peer({
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', () => {
        this.openHostConnection(targetPeerId, { onConnected });
      });

      // Permite receber conexões caso este convidado seja promovido a host
      this.peer.on('connection', (conn) => this.setupIncomingConnection(conn));

      this.peer.on('error', (err) => {
        console.error('Guest peer error:', err);
        if (onError) onError(err);
      });
    } catch (e) {
      if (onError) onError(e);
    }
  }

  /** Reconecta a um novo host usando o mesmo Peer (migração de host). */
  reconnectToHost(newHostId, { onConnected, onError }) {
    if (!this.peer || this.peer.destroyed) {
      if (onError) onError(new Error('Peer indisponível'));
      return;
    }
    this.isHost = false;
    let done = false;
    const timeoutId = setTimeout(() => {
      if (!done && onError) onError(new Error('Tempo esgotado ao reconectar'));
      done = true;
    }, 8000);

    this.openHostConnection(newHostId, {
      onConnected: () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        if (onConnected) onConnected();
      }
    });
  }

  openHostConnection(targetPeerId, { onConnected }) {
    const conn = this.peer.connect(targetPeerId, { reliable: true });
    this.hostConn = conn;

    conn.on('open', () => {
      if (onConnected) onConnected();
    });

    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.type === 'ROOM_BUSY') {
        if (this.hostConn === conn) this.hostConn = null;
        try { conn.close(); } catch (e) {}
        if (this.onJoinRejected) this.onJoinRejected();
        return;
      }
      if (this.onMessage) this.onMessage(data, data.from || conn.peer);
    });

    conn.on('close', () => {
      if (this.hostConn === conn) {
        this.hostConn = null;
        if (this.onHostLost) this.onHostLost(conn.peer);
      }
    });

    conn.on('error', (err) => {
      console.warn('P2P Conn error:', err);
    });
  }

  // ==========================================
  // ENVIO
  // ==========================================
  /** Host: envia a todos os convidados. Convidado: envia ao host (que retransmite). */
  send(data) {
    if (this.isHost) {
      this.broadcast(data);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(data);
    }
  }

  broadcast(data, exceptId = null) {
    for (const [peerId, conn] of this.conns) {
      if (peerId !== exceptId && conn.open) {
        conn.send(data);
      }
    }
  }

  destroyScanner() {
    if (this.scannerPeer) {
      try { this.scannerPeer.destroy(); } catch (e) {}
      this.scannerPeer = null;
    }
  }

  destroy() {
    this.destroyScanner();
    const hostConn = this.hostConn;
    const conns = Array.from(this.conns.values());
    const peer = this.peer;
    // Zera referências antes de fechar para não disparar callbacks de desconexão
    this.hostConn = null;
    this.conns = new Map();
    this.peer = null;
    this.isHost = false;

    if (hostConn) {
      try { hostConn.close(); } catch (e) {}
    }
    conns.forEach((conn) => {
      try { conn.close(); } catch (e) {}
    });
    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }
  }
}
