// Cliente MQTT 3.1.1 sobre WebSocket TLS (WSS) zero-dependência
// Usado como fallback automático anti-CGNAT (Vivo Fibra, 4G/5G, firewalls) quando o WebRTC P2P direto falha.

export const RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

function encodeRemainingLength(len) {
  const bytes = [];
  let x = len;
  do {
    let encoded = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (x > 0);
  return bytes;
}

export class MqttRelayClient {
  constructor({ onMessage, onClose, onReconnect } = {}) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onReconnect = onReconnect;

    this.ws = null;
    this.brokerUrl = '';
    this.brokerIndex = 0;
    this.connected = false;
    this.closedByUser = false;

    this.nextPacketId = 1;
    this.pendingSubs = new Map();
    this.subscribedTopics = new Set();

    this.keepAliveTimer = null;
    this.reconnectTimer = null;
    this._rxBuf = new Uint8Array(0);

    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  _encodeUtf8String(str) {
    const bytes = this.encoder.encode(str);
    const out = new Uint8Array(2 + bytes.length);
    out[0] = (bytes.length >> 8) & 0xff;
    out[1] = bytes.length & 0xff;
    out.set(bytes, 2);
    return out;
  }

  _buildConnectPacket(clientId, keepAliveSec = 30) {
    const vh = new Uint8Array([
      0x00, 0x04, 0x4d, 0x51, 0x54, 0x54,
      0x04,
      0x02,
      (keepAliveSec >> 8) & 0xff,
      keepAliveSec & 0xff,
    ]);
    const cid = this._encodeUtf8String(clientId);
    const remLen = encodeRemainingLength(vh.length + cid.length);
    const pkt = new Uint8Array(1 + remLen.length + vh.length + cid.length);
    let offset = 0;
    pkt[offset++] = 0x10;
    pkt.set(remLen, offset);
    offset += remLen.length;
    pkt.set(vh, offset);
    offset += vh.length;
    pkt.set(cid, offset);
    return pkt;
  }

  _buildSubscribePacket(packetId, topic) {
    const vh = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
    const tBytes = this._encodeUtf8String(topic);
    const remLen = encodeRemainingLength(vh.length + tBytes.length + 1);
    const pkt = new Uint8Array(1 + remLen.length + vh.length + tBytes.length + 1);
    let offset = 0;
    pkt[offset++] = 0x82;
    pkt.set(remLen, offset);
    offset += remLen.length;
    pkt.set(vh, offset);
    offset += vh.length;
    pkt.set(tBytes, offset);
    offset += tBytes.length;
    pkt[offset] = 0x00;
    return pkt;
  }

  _buildPublishPacket(topic, payloadStr) {
    const tBytes = this._encodeUtf8String(topic);
    const pBytes = this.encoder.encode(payloadStr);
    const remLen = encodeRemainingLength(tBytes.length + pBytes.length);
    const pkt = new Uint8Array(1 + remLen.length + tBytes.length + pBytes.length);
    let offset = 0;
    pkt[offset++] = 0x30;
    pkt.set(remLen, offset);
    offset += remLen.length;
    pkt.set(tBytes, offset);
    offset += tBytes.length;
    pkt.set(pBytes, offset);
    return pkt;
  }

  _allocPacketId() {
    const pid = this.nextPacketId;
    this.nextPacketId = pid >= 65535 ? 1 : pid + 1;
    return pid;
  }

  _appendRx(chunk) {
    if (this._rxBuf.length === 0) {
      this._rxBuf = chunk;
      return;
    }
    const merged = new Uint8Array(this._rxBuf.length + chunk.length);
    merged.set(this._rxBuf, 0);
    merged.set(chunk, this._rxBuf.length);
    this._rxBuf = merged;
  }

  _handleBinary(arrayBuffer, onConnack) {
    const chunk = new Uint8Array(arrayBuffer);
    this._appendRx(chunk);

    while (this._rxBuf.length >= 2) {
      let multiplier = 1;
      let remainingLength = 0;
      let idx = 1;
      let rlComplete = false;

      while (idx < this._rxBuf.length) {
        const encodedByte = this._rxBuf[idx++];
        remainingLength += (encodedByte & 127) * multiplier;
        if ((encodedByte & 128) === 0) {
          rlComplete = true;
          break;
        }
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) {
          this._rxBuf = new Uint8Array(0);
          return;
        }
      }

      if (!rlComplete) break;
      const totalLen = idx + remainingLength;
      if (this._rxBuf.length < totalLen) break;

      const header = this._rxBuf[0];
      const type = header >> 4;
      const payload = this._rxBuf.subarray(idx, totalLen);
      this._rxBuf = this._rxBuf.subarray(totalLen);

      if (type === 2) {
        const returnCode = payload.length >= 2 ? payload[1] : 255;
        onConnack?.(returnCode);
      } else if (type === 9) {
        if (payload.length >= 2) {
          const pid = (payload[0] << 8) | payload[1];
          const pending = this.pendingSubs.get(pid);
          if (pending) {
            this.pendingSubs.delete(pid);
            clearTimeout(pending.timer);
            pending.resolve();
          }
        }
      } else if (type === 3) {
        if (payload.length >= 2) {
          const qos = (header >> 1) & 3;
          const topicLen = (payload[0] << 8) | payload[1];
          const topicEnd = 2 + topicLen;
          if (topicEnd <= payload.length) {
            const topic = this.decoder.decode(payload.subarray(2, topicEnd));
            const bodyStart = qos > 0 ? topicEnd + 2 : topicEnd;
            if (bodyStart <= payload.length) {
              const text = this.decoder.decode(payload.subarray(bodyStart));
              this.onMessage?.(topic, text);
            }
          }
        }
      }
    }
  }

  _clearTimers() {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  _clearPendingSubs(reason) {
    for (const [pid, pending] of this.pendingSubs.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingSubs.delete(pid);
    }
  }

  _connectSingle(url, index, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (this.closedByUser) {
        reject(new Error('Relay client closed'));
        return;
      }

      let settled = false;
      let ws;
      this._rxBuf = new Uint8Array(0);

      const failTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws?.close(); } catch (_) {}
          reject(new Error(`Broker timeout: ${url}`));
        }
      }, timeoutMs);

      const fail = (err) => {
        clearTimeout(failTimer);
        if (!settled) {
          settled = true;
          try { ws?.close(); } catch (_) {}
          reject(err instanceof Error ? err : new Error(String(err || 'Relay WebSocket error')));
        }
      };

      try {
        ws = new WebSocket(url, ['mqtt']);
        ws.binaryType = 'arraybuffer';
      } catch (err) {
        fail(err);
        return;
      }

      ws.onopen = () => {
        if (settled || this.closedByUser) return;
        const cid = 'bulu_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
        try {
          ws.send(this._buildConnectPacket(cid, 30));
        } catch (err) {
          fail(err);
        }
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') return;
        const handleData = (buf) => {
          this._handleBinary(buf, (returnCode) => {
            if (settled) return;
            clearTimeout(failTimer);
            if (returnCode === 0) {
              settled = true;
              this.ws = ws;
              this.brokerUrl = url;
              this.brokerIndex = index;
              this.connected = true;
              this._startKeepAlive();
              resolve({ brokerUrl: url, brokerIndex: index });
            } else {
              try { ws.close(); } catch (_) {}
              reject(new Error(`MQTT CONNACK refused (${returnCode})`));
            }
          });
        };

        if (ev.data instanceof ArrayBuffer) {
          handleData(ev.data);
        } else if (ev.data && typeof ev.data.arrayBuffer === 'function') {
          ev.data.arrayBuffer().then(handleData).catch(() => {});
        }
      };

      ws.onerror = () => {
        if (!settled) fail(new Error(`WebSocket connection failed: ${url}`));
      };

      ws.onclose = () => {
        if (!settled) {
          fail(new Error(`WebSocket closed before CONNACK: ${url}`));
          return;
        }
        const wasConnected = this.connected;
        this.connected = false;
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
        this._clearPendingSubs('Connection lost');
        if (this.ws === ws) this.ws = null;

        if (!this.closedByUser && wasConnected) {
          this.onClose?.();
          this._scheduleReconnect();
        }
      };
    });
  }

  _startKeepAlive() {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(() => {
      if (this.isOpen()) {
        try {
          this.ws.send(new Uint8Array([0xc0, 0x00]));
        } catch (_) {}
      }
    }, 15000);
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.closedByUser) return;
    this.reconnectTimer = setTimeout(async () => {
      if (this.closedByUser || this.connected) return;
      try {
        await this.connect(this.brokerIndex, { timeoutMs: 4500, singleBroker: true });
        for (const topic of this.subscribedTopics) {
          await this.subscribe(topic, 4000).catch(() => {});
        }
        this.onReconnect?.();
      } catch (_) {
        if (!this.closedByUser) {
          this._scheduleReconnect();
        }
      }
    }, 1500);
  }

  async connect(startIndex = 0, { timeoutMs = 4500, singleBroker = false } = {}) {
    if (singleBroker) {
      const idx = Math.max(0, Math.min(RELAY_BROKERS.length - 1, startIndex));
      return await this._connectSingle(RELAY_BROKERS[idx], idx, timeoutMs);
    }

    let lastErr = null;
    for (let i = Math.max(0, startIndex); i < RELAY_BROKERS.length; i++) {
      if (this.closedByUser) throw new Error('Relay client closed');
      try {
        return await this._connectSingle(RELAY_BROKERS[i], i, timeoutMs);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('All WSS relay brokers failed');
  }

  async subscribe(topic, timeoutMs = 4000) {
    this.subscribedTopics.add(topic);
    if (!this.isOpen()) {
      throw new Error('Relay socket not open');
    }
    const pid = this._allocPacketId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSubs.delete(pid);
        reject(new Error(`SUBACK timeout for ${topic}`));
      }, timeoutMs);

      this.pendingSubs.set(pid, { resolve, reject, timer });
      try {
        this.ws.send(this._buildSubscribePacket(pid, topic));
      } catch (err) {
        clearTimeout(timer);
        this.pendingSubs.delete(pid);
        reject(err);
      }
    });
  }

  publish(topic, payloadStr) {
    if (!this.isOpen()) return false;
    try {
      this.ws.send(this._buildPublishPacket(topic, payloadStr));
      return true;
    } catch (_) {
      return false;
    }
  }

  isOpen() {
    return Boolean(this.connected && this.ws && this.ws.readyState === 1);
  }

  close() {
    this.closedByUser = true;
    this.connected = false;
    this._clearTimers();
    this._clearPendingSubs('Relay client closed');
    if (this.ws) {
      try {
        if (this.ws.readyState === 1) {
          this.ws.send(new Uint8Array([0xe0, 0x00]));
        }
      } catch (_) {}
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this._rxBuf = new Uint8Array(0);
  }
}
