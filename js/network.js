/**
 * Módulo de Rede P2P (WebRTC / PeerJS)
 * Responsável exclusivamente por criar salas, conectar pares e enviar/receber pacotes WebRTC.
 */

export class P2PNetwork {
  constructor({ onMessage, onDisconnect }) {
    this.peer = null;
    this.peerConn = null;
    this.roomCode = '';
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
  }

  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
  }

  isConnected() {
    return Boolean(this.peerConn && this.peerConn.open);
  }

  createRoom({ onOpen, onError }) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.roomCode = code;
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

  joinRoom(code, { onConnected, onError }) {
    const targetPeerId = `termo-room-${code}`;
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

  destroy() {
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

