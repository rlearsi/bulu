/**
 * Módulo de Rede P2P Híbrido (WebRTC / PeerJS + Fallback Automático Relay WSS)
 * Responsável exclusivamente por criar salas (privadas e públicas), listar salas públicas abertas,
 * conectar pares e enviar/receber pacotes — atravessando CGNAT (Vivo Fibra, 4G/5G) automaticamente
 * via Relay WSS (MQTT 3.1.1) quando o WebRTC P2P direto não consegue completar.
 *
 * Topologia em estrela: o host mantém uma conexão (PeerJS P2P ou Relay WSS) com cada convidado
 * e retransmite as mensagens dos convidados para os demais. Se o host sair, um convidado pode
 * assumir o papel de host (becomeHost) e os outros se reconectam a ele (reconnectToHost).
 */

import { MqttRelayClient, RELAY_BROKERS } from './relay.js';

const PUBLIC_SLOT_PREFIX = 'termo-duelo-public-';
const MAX_PUBLIC_SLOTS = 10;
const P2P_FALLBACK_TIMEOUT_MS = 6500;

function relayTopicC2H(targetId) {
  return `bulu/r1/${targetId}/c2h`;
}

function relayTopicH2C(targetId) {
  return `bulu/r1/${targetId}/h2c`;
}

function relayTopicTo(targetId, peerId) {
  return `bulu/r1/${targetId}/to/${peerId}`;
}

function makeRelayPeerId() {
  return 'bulu-r-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const PEER_SERVER_OPTIONS = {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  path: '/',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'stun:stun.nextcloud.com:443' }
    ],
    iceCandidatePoolSize: 10
  }
};

export class P2PNetwork {
  /**
   * @param {object} opts
   * @param {(data: object, fromId: string) => void} opts.onMessage
   * @param {(peerId: string) => void} opts.onPeerLeft      Host: um convidado desconectou
   * @param {(hostId: string) => void} opts.onHostLost       Convidado: conexão com o host caiu
   * @param {() => void} opts.onJoinRejected                 Convidado: host recusou (sala cheia/em jogo)
   * @param {(data: object, peerId: string) => boolean} opts.acceptJoin  Host: aceita JOIN_GAME / REJOIN?
   * @param {() => object} opts.getRoomInfo                  Host: dados para listagem pública
   * @param {(call: any) => void} [opts.onIncomingCall]      Chamada de mídia WebRTC recebida (Voz)
   */
  constructor({ onMessage, onPeerLeft, onHostLost, onJoinRejected, acceptJoin, getRoomInfo, onIncomingCall }) {
    this.peer = null;
    this.isHost = false;
    this.conns = new Map(); // Host: peerId -> DataConnection | RelayConnection
    this.hostConn = null;   // Convidado: conexão com o host
    this.scannerPeer = null;
    this.scannerRelay = null;
    this.roomCode = '';
    this.publicSlotId = '';
    this.isPublicRoom = false;

    this._localFallbackId = '';
    this.relayClient = null;
    this.relayTargetId = '';
    this.relayHeartbeatTimer = null;
    this.hostLastSeenAt = 0;
    this._relayHandshakePending = null;
    this._connectGen = 0;

    this.onMessage = onMessage;
    this.onPeerLeft = onPeerLeft;
    this.onHostLost = onHostLost;
    this.onJoinRejected = onJoinRejected;
    this.acceptJoin = acceptJoin;
    this.getRoomInfo = getRoomInfo;
    this.onIncomingCall = onIncomingCall;
  }

  get myId() {
    return (this.peer && this.peer.id) || this._localFallbackId || '';
  }

  getIceServers() {
    return PEER_SERVER_OPTIONS.config.iceServers;
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
    const gen = ++this._connectGen;
    this.roomCode = code;
    this.publicSlotId = '';
    this.isPublicRoom = false;
    this.isHost = true;
    const peerId = `termo-room-${code}`;
    this._localFallbackId = peerId;

    let openNotified = false;
    const notifyOpen = (id) => {
      if (openNotified || gen !== this._connectGen) return;
      openNotified = true;
      if (onOpen) onOpen(code, id);
    };

    // Abre escuta Relay WSS em paralelo para aceitar jogadores atrás de CGNAT (Vivo/4G/5G)
    const relayReady = this._startRelayHost(peerId, gen).catch(() => false);

    try {
      this.peer = new Peer(peerId, {
        ...PEER_SERVER_OPTIONS,
        config: { iceServers: this.getIceServers(), iceCandidatePoolSize: 10 }
      });

      this.peer.on('open', (id) => {
        notifyOpen(id);
      });

      this.peer.on('disconnected', () => {
        if (this.isHost && this.peer && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch (_) {}
        }
      });

      this.peer.on('connection', (conn) => this.setupIncomingConnection(conn));
      this.peer.on('call', (call) => {
        if (this.onIncomingCall) this.onIncomingCall(call);
      });

      this.peer.on('error', async (err) => {
        console.warn('Peer host error:', err);
        if (!openNotified && gen === this._connectGen) {
          const ok = await relayReady;
          if (ok && gen === this._connectGen) {
            notifyOpen(peerId);
            return;
          }
          if (onError) onError(err);
        }
      });
    } catch (e) {
      relayReady.then((ok) => {
        if (ok && gen === this._connectGen) {
          notifyOpen(peerId);
        } else if (onError) {
          onError(e);
        }
      });
    }

    return code;
  }

  createPublicRoom({ onOpen, onError }) {
    this.destroy();
    const gen = ++this._connectGen;
    this.roomCode = '';
    this.isPublicRoom = true;
    this.isHost = true;

    const trySlot = (slotIndex) => {
      if (gen !== this._connectGen) return;
      if (slotIndex > MAX_PUBLIC_SLOTS) {
        if (onError) onError(new Error('Todas as vagas públicas estão ocupadas no momento.'));
        return;
      }

      const slotId = `${PUBLIC_SLOT_PREFIX}${slotIndex}`;
      try {
        const candidatePeer = new Peer(slotId, {
          ...PEER_SERVER_OPTIONS,
          config: { iceServers: this.getIceServers(), iceCandidatePoolSize: 10 }
        });

        let opened = false;

        candidatePeer.on('open', (id) => {
          if (gen !== this._connectGen) {
            try { candidatePeer.destroy(); } catch (_) {}
            return;
          }
          opened = true;
          this.peer = candidatePeer;
          this.publicSlotId = id;
          this._localFallbackId = id;
          this._startRelayHost(id, gen).catch(() => {});
          if (onOpen) onOpen(id);
        });

        candidatePeer.on('disconnected', () => {
          if (this.isHost && this.peer === candidatePeer && !candidatePeer.destroyed) {
            try { candidatePeer.reconnect(); } catch (_) {}
          }
        });

        candidatePeer.on('connection', (conn) => this.setupIncomingConnection(conn));
        candidatePeer.on('call', (call) => {
          if (this.onIncomingCall) this.onIncomingCall(call);
        });

        candidatePeer.on('error', (err) => {
          if (!opened && err && err.type === 'unavailable-id') {
            try { candidatePeer.destroy(); } catch (_) {}
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
      this._handleHostIncomingData(conn, data);
    });
  }

  _handleHostIncomingData(conn, data) {
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
          try { conn.close(); } catch (_) {}
        }, 150);
        return;
      }

      this.conns.set(conn.peer, conn);
      if (conn.via !== 'relay') {
        conn.on('close', () => {
          if (this.conns.get(conn.peer) === conn) {
            this.conns.delete(conn.peer);
            if (this.onPeerLeft) this.onPeerLeft(conn.peer);
          }
        });
        conn.on('error', (err) => {
          console.warn('P2P Conn error:', err);
        });
      }

      if (this.onMessage) this.onMessage(data, conn.peer);
      return;
    }

    // Demais mensagens da partida: retransmite aos outros convidados e processa localmente
    if (this.conns.get(conn.peer) === conn) {
      const stamped = { ...data, from: conn.peer };
      this.broadcast(stamped, conn.peer);
      if (this.onMessage) this.onMessage(stamped, conn.peer);
    }
  }

  /** Convidado assume o papel de host após a saída do host original. */
  becomeHost() {
    this.isHost = true;
    this.hostConn = null;
    this.roomCode = '';
    this.publicSlotId = '';
    this.isPublicRoom = false;
    const newHostId = this.myId;
    if (newHostId) {
      const gen = this._connectGen;
      this._startRelayHost(newHostId, gen).catch(() => {});
    }
  }

  removePeer(peerId) {
    const conn = this.conns.get(peerId);
    this.conns.delete(peerId);
    if (conn) {
      try { conn.close(); } catch (_) {}
    }
  }

  // ==========================================
  // LISTAGEM DE SALAS PÚBLICAS (P2P + RELAY WSS)
  // ==========================================
  scanPublicRooms({ onRoomFound, onComplete }) {
    this.destroyScanner();

    const foundMap = new Map();
    const pendingSlots = new Set();
    for (let i = 1; i <= MAX_PUBLIC_SLOTS; i++) {
      pendingSlots.add(`${PUBLIC_SLOT_PREFIX}${i}`);
    }

    let finished = false;
    let timeoutId = null;

    const reportRoom = (data) => {
      if (finished || !data || data.type !== 'PUBLIC_ROOM_INFO' || !data.slotId) return;
      if (foundMap.has(data.slotId)) return;
      const roomInfo = {
        slotId: data.slotId,
        hostName: data.hostName || 'Jogador',
        hostAvatar: data.hostAvatar || '',
        count: data.count || 1,
        max: data.max || 2,
        mode: data.mode || 'normal'
      };
      foundMap.set(data.slotId, roomInfo);
      if (onRoomFound) onRoomFound(roomInfo);
    };

    const finishScan = () => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      this.destroyScanner();
      if (onComplete) onComplete(Array.from(foundMap.values()));
    };

    const markSlotDone = (slotId) => {
      pendingSlots.delete(slotId);
    };

    timeoutId = setTimeout(() => {
      finishScan();
    }, 2800);

    // 1. Varredura via PeerJS
    try {
      const scanner = new Peer({
        ...PEER_SERVER_OPTIONS,
        config: { iceServers: this.getIceServers(), iceCandidatePoolSize: 10 }
      });
      this.scannerPeer = scanner;

      scanner.on('open', () => {
        for (let i = 1; i <= MAX_PUBLIC_SLOTS; i++) {
          const slotId = `${PUBLIC_SLOT_PREFIX}${i}`;
          const conn = scanner.connect(slotId, { reliable: true });

          conn.on('open', () => {
            conn.send({ type: 'QUERY_ROOM_INFO' });
          });

          conn.on('data', (data) => {
            reportRoom(data);
            try { conn.close(); } catch (_) {}
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
          }
        }
      });
    } catch (_) {}

    // 2. Varredura paralela via Relay WSS (permite descobrir salas mesmo em 4G/CGNAT)
    (async () => {
      const scanId = 'scan_' + Math.random().toString(36).slice(2, 10);
      const replyTopic = `bulu/r1/scan/${scanId}`;
      const client = new MqttRelayClient({
        onMessage: (_topic, text) => {
          try {
            const env = JSON.parse(text);
            if (env && env.d) reportRoom(env.d);
          } catch (_) {}
        }
      });
      this.scannerRelay = client;
      try {
        await client.connect(0, { timeoutMs: 2200 });
        if (finished || this.scannerRelay !== client) {
          client.close();
          return;
        }
        await client.subscribe(replyTopic, 1500);
        if (finished || this.scannerRelay !== client) {
          client.close();
          return;
        }
        for (let i = 1; i <= MAX_PUBLIC_SLOTS; i++) {
          const slotId = `${PUBLIC_SLOT_PREFIX}${i}`;
          client.publish(
            relayTopicC2H(slotId),
            JSON.stringify({ from: scanId, replyTo: replyTopic, d: { type: 'QUERY_ROOM_INFO' } })
          );
        }
      } catch (_) {
        client.close();
      }
    })();
  }

  // ==========================================
  // CONVIDADO (P2P + FALLBACK AUTOMÁTICO RELAY WSS)
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
    const gen = ++this._connectGen;
    this.isHost = false;
    this._localFallbackId = makeRelayPeerId();

    let settled = false;
    let fallbackStarted = false;

    const triggerRelayFallback = (p2pErr) => {
      if (settled || fallbackStarted || gen !== this._connectGen) return;
      fallbackStarted = true;
      // Fecha PeerJS pendente antes de subir Relay WSS
      if (this.hostConn && this.hostConn.via !== 'relay') {
        try { this.hostConn.close(); } catch (_) {}
        this.hostConn = null;
      }
      if (this.peer) {
        try { this.peer.destroy(); } catch (_) {}
        this.peer = null;
      }
      this._connectGuestViaRelay(targetPeerId, gen, {
        onConnected: () => {
          if (settled || gen !== this._connectGen) return;
          settled = true;
          if (onConnected) onConnected();
        },
        onError: (relayErr) => {
          if (settled || gen !== this._connectGen) return;
          settled = true;
          if (onError) onError(relayErr || p2pErr);
        }
      });
    };

    const fallbackTimer = setTimeout(() => {
      triggerRelayFallback(new Error('Tempo esgotado na conexão P2P.'));
    }, P2P_FALLBACK_TIMEOUT_MS);

    try {
      this.peer = new Peer({
        ...PEER_SERVER_OPTIONS,
        config: { iceServers: this.getIceServers(), iceCandidatePoolSize: 10 }
      });

      this.peer.on('open', (id) => {
        if (settled || fallbackStarted || gen !== this._connectGen) return;
        this._localFallbackId = id;
        this.openHostConnection(targetPeerId, {
          onConnected: () => {
            if (settled || fallbackStarted || gen !== this._connectGen) return;
            settled = true;
            clearTimeout(fallbackTimer);
            if (onConnected) onConnected();
          }
        });
      });

      // Permite receber conexões caso este convidado seja promovido a host
      this.peer.on('connection', (conn) => this.setupIncomingConnection(conn));
      this.peer.on('call', (call) => {
        if (this.onIncomingCall) this.onIncomingCall(call);
      });

      this.peer.on('error', (err) => {
        console.warn('Guest peer error (tentando Relay WSS):', err);
        clearTimeout(fallbackTimer);
        triggerRelayFallback(err);
      });
    } catch (e) {
      clearTimeout(fallbackTimer);
      triggerRelayFallback(e);
    }
  }

  /** Reconecta a um novo host usando o mesmo Peer ou Relay WSS (migração de host). */
  reconnectToHost(newHostId, { onConnected, onError }) {
    this.isHost = false;
    const gen = ++this._connectGen;
    let done = false;
    let fallbackStarted = false;

    const finishOk = () => {
      if (done || gen !== this._connectGen) return;
      done = true;
      clearTimeout(p2pTimer);
      clearTimeout(totalTimer);
      if (onConnected) onConnected();
    };

    const finishErr = (err) => {
      if (done || gen !== this._connectGen) return;
      done = true;
      clearTimeout(p2pTimer);
      clearTimeout(totalTimer);
      if (onError) onError(err);
    };

    const tryRelay = () => {
      if (done || fallbackStarted || gen !== this._connectGen) return;
      fallbackStarted = true;
      this._connectGuestViaRelay(newHostId, gen, {
        onConnected: finishOk,
        onError: finishErr
      });
    };

    const totalTimer = setTimeout(() => {
      finishErr(new Error('Tempo esgotado ao reconectar'));
    }, 8000);

    const p2pTimer = setTimeout(() => {
      tryRelay();
    }, 3500);

    if (this.peer && !this.peer.destroyed) {
      this.openHostConnection(newHostId, { onConnected: finishOk });
    } else {
      clearTimeout(p2pTimer);
      tryRelay();
    }
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
        try { conn.close(); } catch (_) {}
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
  // RELAY WSS (MQTT 3.1.1 — ANTI-CGNAT / 4G / VIVO)
  // ==========================================
  async _startRelayHost(targetId, gen) {
    if (this.relayClient) {
      this.relayClient.close();
      this.relayClient = null;
    }
    const client = new MqttRelayClient({
      onMessage: (_topic, text) => this._handleRelayHostMessage(text)
    });
    await client.connect(0, { timeoutMs: 4500 });
    if (!this.isHost || gen !== this._connectGen) {
      client.close();
      return false;
    }
    await client.subscribe(relayTopicC2H(targetId), 4000);
    if (!this.isHost || gen !== this._connectGen) {
      client.close();
      return false;
    }
    this.relayClient = client;
    this.relayTargetId = targetId;
    this._startRelayHeartbeat();
    return true;
  }

  _createHostRelayConn(peerId) {
    const conn = {
      peer: peerId,
      via: 'relay',
      open: true,
      lastSeenAt: Date.now(),
      send: (data) => {
        if (!conn.open || !this.relayClient?.isOpen()) return;
        this.relayClient.publish(
          relayTopicTo(this.relayTargetId, peerId),
          JSON.stringify({ d: data })
        );
      },
      close: () => {
        if (!conn.open) return;
        conn.open = false;
        if (this.relayClient?.isOpen()) {
          this.relayClient.publish(
            relayTopicTo(this.relayTargetId, peerId),
            JSON.stringify({ d: { __relayKicked: true } })
          );
        }
      }
    };
    return conn;
  }

  _handleRelayHostMessage(text) {
    if (!this.isHost) return;
    let env;
    try { env = JSON.parse(text); } catch (_) { return; }
    if (!env || !env.from || !env.d || typeof env.d !== 'object') return;

    const fromId = String(env.from);
    if (fromId === this.myId) return;
    const data = env.d;

    // Consulta de sala pública vinda do scanner Relay
    if (data.type === 'QUERY_ROOM_INFO' && env.replyTo) {
      const info = this.getRoomInfo ? this.getRoomInfo() : null;
      if (info && info.joinable && this.relayClient?.isOpen()) {
        this.relayClient.publish(env.replyTo, JSON.stringify({
          d: {
            type: 'PUBLIC_ROOM_INFO',
            slotId: this.publicSlotId,
            hostName: info.hostName || 'Jogador 1',
            hostAvatar: info.hostAvatar || '',
            count: info.count || 1,
            max: info.max || 2,
            mode: info.mode || 'normal'
          }
        }));
      }
      return;
    }

    // Handshake inicial do convidado via Relay WSS
    if (data.__relayHello) {
      if (this.relayClient?.isOpen()) {
        this.relayClient.publish(
          relayTopicTo(this.relayTargetId, fromId),
          JSON.stringify({ d: { __relayAck: true, hostId: this.myId } })
        );
      }
      return;
    }

    let conn = this.conns.get(fromId);
    if (conn && conn.via === 'relay') {
      conn.lastSeenAt = Date.now();
    }

    if (data.__relayPing) {
      if (conn && conn.open) conn.send({ __relayPong: true });
      return;
    }
    if (data.__relayPong) {
      return;
    }
    if (data.__relayLeave) {
      if (conn && conn.via === 'relay') {
        conn.open = false;
        this.conns.delete(fromId);
        if (this.onPeerLeft) this.onPeerLeft(fromId);
      }
      return;
    }

    if (!conn && (data.type === 'JOIN_GAME' || data.type === 'REJOIN')) {
      conn = this._createHostRelayConn(fromId);
    }

    if (conn) {
      this._handleHostIncomingData(conn, data);
    }
  }

  async _connectGuestViaRelay(targetPeerId, gen, { onConnected, onError }) {
    const myPeerId = this.myId || makeRelayPeerId();
    this._localFallbackId = myPeerId;
    let lastErr = null;

    for (let i = 0; i < RELAY_BROKERS.length; i++) {
      if (gen !== this._connectGen || this.isHost) return;

      const client = new MqttRelayClient({
        onMessage: (_topic, text) => this._handleRelayGuestMessage(text)
      });

      try {
        await client.connect(i, { timeoutMs: 4000, singleBroker: true });
      } catch (err) {
        client.close();
        lastErr = err;
        continue;
      }

      try {
        await client.subscribe(relayTopicTo(targetPeerId, myPeerId), 3500);
        await client.subscribe(relayTopicH2C(targetPeerId), 3500);
      } catch (err) {
        client.close();
        lastErr = err;
        continue;
      }

      let acked = false;
      try {
        await new Promise((resolve, reject) => {
          let done = false;
          const cleanup = () => {
            clearInterval(retryTimer);
            clearTimeout(waitTimer);
            if (this._relayHandshakePending?.abort === abortFn) {
              this._relayHandshakePending = null;
            }
          };
          const abortFn = () => {
            if (!done) {
              done = true;
              cleanup();
              reject(new Error('Conexão cancelada.'));
            }
          };
          this._relayHandshakePending = {
            resolve: () => {
              if (!done) {
                done = true;
                cleanup();
                resolve();
              }
            },
            abort: abortFn
          };

          const sendHello = () => {
            client.publish(
              relayTopicC2H(targetPeerId),
              JSON.stringify({ from: myPeerId, d: { __relayHello: true } })
            );
          };
          sendHello();
          const retryTimer = setInterval(sendHello, 1100);
          const waitTimer = setTimeout(() => {
            if (!done) {
              done = true;
              cleanup();
              reject(new Error('Sala não encontrada no Relay.'));
            }
          }, 4800);
        });
        acked = true;
      } catch (err) {
        client.close();
        lastErr = err;
        continue;
      }

      if (!acked || gen !== this._connectGen || this.isHost) {
        client.close();
        return;
      }

      this.relayClient = client;
      this.relayTargetId = targetPeerId;
      this.hostLastSeenAt = Date.now();

      const relayConn = {
        peer: targetPeerId,
        via: 'relay',
        open: true,
        send: (data) => {
          if (!relayConn.open || !this.relayClient?.isOpen()) return;
          this.relayClient.publish(
            relayTopicC2H(targetPeerId),
            JSON.stringify({ from: this.myId, d: data })
          );
        },
        close: () => {
          if (!relayConn.open) return;
          relayConn.open = false;
          if (this.relayClient?.isOpen()) {
            this.relayClient.publish(
              relayTopicC2H(targetPeerId),
              JSON.stringify({ from: this.myId, d: { __relayLeave: true } })
            );
          }
        }
      };

      this.hostConn = relayConn;
      this._startRelayHeartbeat();
      if (onConnected) onConnected();
      return;
    }

    if (gen === this._connectGen && onError) {
      onError(lastErr || new Error('Não foi possível conectar à sala (P2P e Relay WSS).'));
    }
  }

  _handleRelayGuestMessage(text) {
    if (this.isHost) return;
    let env;
    try { env = JSON.parse(text); } catch (_) { return; }
    if (!env || !env.d || typeof env.d !== 'object') return;
    if (env.skip && env.skip === this.myId) return;

    this.hostLastSeenAt = Date.now();
    const data = env.d;

    if (data.__relayAck && this._relayHandshakePending) {
      this._relayHandshakePending.resolve();
      return;
    }
    if (data.__relayPing) {
      if (this.hostConn && this.hostConn.open) this.hostConn.send({ __relayPong: true });
      return;
    }
    if (data.__relayPong) {
      return;
    }
    if (data.__relayHostClosed || data.__relayKicked) {
      const lostPeer = this.hostConn ? this.hostConn.peer : this.relayTargetId;
      if (this.hostConn) this.hostConn.open = false;
      this.hostConn = null;
      if (this.onHostLost) this.onHostLost(lostPeer);
      return;
    }
    if (data.type === 'ROOM_BUSY') {
      if (this.hostConn) {
        this.hostConn.open = false;
        this.hostConn = null;
      }
      if (this.onJoinRejected) this.onJoinRejected();
      return;
    }
    if (this.onMessage) {
      this.onMessage(data, data.from || (this.hostConn ? this.hostConn.peer : this.relayTargetId));
    }
  }

  _startRelayHeartbeat() {
    clearInterval(this.relayHeartbeatTimer);
    this.relayHeartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (this.isHost) {
        for (const [peerId, conn] of Array.from(this.conns.entries())) {
          if (conn.via !== 'relay') continue;
          if (now - (conn.lastSeenAt || now) > 14000) {
            conn.open = false;
            this.conns.delete(peerId);
            if (this.onPeerLeft) this.onPeerLeft(peerId);
          } else if (conn.open) {
            conn.send({ __relayPing: true });
          }
        }
      } else if (this.hostConn && this.hostConn.via === 'relay' && this.hostConn.open) {
        if (this.hostLastSeenAt > 0 && now - this.hostLastSeenAt > 16000) {
          const lostPeer = this.hostConn.peer;
          this.hostConn.open = false;
          this.hostConn = null;
          if (this.onHostLost) this.onHostLost(lostPeer);
        } else {
          this.hostConn.send({ __relayPing: true });
        }
      }
    }, 3000);
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
    let hasRelayTargets = false;
    for (const [peerId, conn] of this.conns) {
      if (peerId === exceptId || !conn.open) continue;
      if (conn.via === 'relay') {
        hasRelayTargets = true;
      } else {
        conn.send(data);
      }
    }
    if (hasRelayTargets && this.relayClient?.isOpen() && this.relayTargetId) {
      this.relayClient.publish(
        relayTopicH2C(this.relayTargetId),
        JSON.stringify({ skip: exceptId || null, d: data })
      );
    }
  }

  destroyScanner() {
    if (this.scannerPeer) {
      try { this.scannerPeer.destroy(); } catch (_) {}
      this.scannerPeer = null;
    }
    if (this.scannerRelay) {
      try { this.scannerRelay.close(); } catch (_) {}
      this.scannerRelay = null;
    }
  }

  destroy() {
    this._connectGen++;
    this.destroyScanner();

    if (this._relayHandshakePending) {
      this._relayHandshakePending.abort();
      this._relayHandshakePending = null;
    }

    clearInterval(this.relayHeartbeatTimer);
    this.relayHeartbeatTimer = null;

    if (this.isHost && this.relayClient?.isOpen() && this.relayTargetId) {
      this.relayClient.publish(
        relayTopicH2C(this.relayTargetId),
        JSON.stringify({ d: { __relayHostClosed: true } })
      );
    }

    const hostConn = this.hostConn;
    const conns = Array.from(this.conns.values());
    const peer = this.peer;
    const relayClient = this.relayClient;

    // Zera referências antes de fechar para não disparar callbacks de desconexão
    this.hostConn = null;
    this.conns = new Map();
    this.peer = null;
    this.relayClient = null;
    this.relayTargetId = '';
    this.hostLastSeenAt = 0;
    this.isHost = false;

    if (hostConn) {
      try { hostConn.close(); } catch (_) {}
    }
    conns.forEach((conn) => {
      try { conn.close(); } catch (_) {}
    });
    if (peer) {
      try { peer.destroy(); } catch (_) {}
    }
    if (relayClient) {
      try { relayClient.close(); } catch (_) {}
    }
  }
}
