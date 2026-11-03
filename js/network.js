/**
 * Módulo de Rede P2P (WebRTC / PeerJS)
 * Responsável exclusivamente por criar salas (privadas e públicas), listar salas públicas abertas, conectar pares e enviar/receber pacotes WebRTC.
 */

const PUBLIC_SLOT_PREFIX = 'termo-duelo-public-';
const MAX_PUBLIC_SLOTS = 10;

export class P2PNetwork {
  constructor({ onMessage, onDisconnect }) {
    this.peer = null;
    this.peerConn = null;
    this.scannerPeer = null;
    this.roomCode = '';
    this.publicSlotId = '';
    this.isPublicRoom = false;
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
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
    return Boolean(this.peerConn && this.peerConn.open);
  }

  createRoom({ onOpen, onError }) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.roomCode = code;
    this.publicSlotId = '';
    this.isPublicRoom = false;
    const peerId = `termo-room-${code}`;

    this.destroy();

    try {
      this.peer = new Peer(peerId, {
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', (id) => {
        if (onOpen) onOpen(code, id);
      });

      this.peer.on('connection', (conn) => {
        this.peerConn = conn;
        this.setupConnectionListeners(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (onError) onError(err);
      });
    } catch (e) {
      if (onError) onError(e);
    }

    return code;
  }

  createPublicRoom({ getHostProfile, onOpen, onError }) {
    this.destroy();
    this.roomCode = '';
    this.isPublicRoom = true;

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

        candidatePeer.on('connection', (conn) => {
          this.setupPublicHostConnection(conn, getHostProfile);
        });

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

  setupPublicHostConnection(conn, getHostProfile) {
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      // Consulta de listagem de salas públicas abertas
      if (data.type === 'QUERY_ROOM_INFO') {
        if (!this.isConnected()) {
          const profile = getHostProfile ? getHostProfile() : { name: 'Jogador 1', avatar: '' };
          conn.send({
            type: 'PUBLIC_ROOM_INFO',
            slotId: this.publicSlotId,
            hostName: profile.name || 'Jogador 1',
            hostAvatar: profile.avatar || ''
          });
        } else {
          conn.send({ type: 'ROOM_BUSY' });
        }
        return;
      }

      // Jogador entrando efetivamente na sala pública para jogar
      if (data.type === 'JOIN_GAME') {
        if (this.peerConn && this.peerConn.open && this.peerConn !== conn) {
          conn.send({ type: 'ROOM_BUSY' });
          setTimeout(() => {
            try { conn.close(); } catch (e) {}
          }, 150);
          return;
        }

        this.peerConn = conn;
        conn.on('close', () => {
          if (this.peerConn === conn && this.onDisconnect) {
            this.onDisconnect();
          }
        });
        conn.on('error', (err) => {
          console.warn('P2P Conn error:', err);
        });

        if (this.onMessage) this.onMessage(data);
        return;
      }

      // Demais mensagens da partida vindas do oponente conectado
      if (this.peerConn === conn && this.onMessage) {
        this.onMessage(data);
      }
    });
  }

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
                hostAvatar: data.hostAvatar || ''
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

  joinRoom(code, { onConnected, onError }) {
    const targetPeerId = `termo-room-${code}`;
    this.connectToTargetPeer(targetPeerId, { onConnected, onError });
  }

  joinPublicRoom(slotId, { onConnected, onError }) {
    this.connectToTargetPeer(slotId, { onConnected, onError });
  }

  connectToTargetPeer(targetPeerId, { onConnected, onError }) {
    this.destroy();

    try {
      this.peer = new Peer({
        config: { iceServers: this.getIceServers() }
      });

      this.peer.on('open', () => {
        const conn = this.peer.connect(targetPeerId, { reliable: true });
        this.peerConn = conn;
        this.setupConnectionListeners(conn);

        conn.on('open', () => {
          if (onConnected) onConnected();
        });
      });

      this.peer.on('error', (err) => {
        console.error('Guest peer error:', err);
        if (onError) onError(err);
      });
    } catch (e) {
      if (onError) onError(e);
    }
  }

  setupConnectionListeners(conn) {
    conn.on('data', (data) => {
      if (data && data.type === 'ROOM_BUSY') {
        try { conn.close(); } catch (e) {}
        return;
      }
      if (this.onMessage) this.onMessage(data);
    });

    conn.on('close', () => {
      if (this.onDisconnect) this.onDisconnect();
    });

    conn.on('error', (err) => {
      console.warn('P2P Conn error:', err);
    });
  }

  send(data) {
    if (this.peerConn && this.peerConn.open) {
      this.peerConn.send(data);
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
    if (this.peerConn) {
      try { this.peerConn.close(); } catch (e) {}
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.peerConn = null;
    this.peer = null;
  }
}
