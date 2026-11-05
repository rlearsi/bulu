/**
 * Módulo de Voz em Tempo Real (WebRTC / PeerJS Calls)
 * Gerencia a transmissão de áudio bidirecional em tempo real entre jogadores na partida.
 * Inclui:
 * - Solicitação mútua ("Fulano quer iniciar um chat de voz") com banner toast de Aceitar / Recusar
 * - Botão de microfone no topo com estados: inativo, solicitando, ativo (transmitindo), mutado, recusado (dot vermelho)
 * - Transmissão de áudio usando MediaStream e peer.call() / peer.on('call')
 */

export class VoiceManager {
  /**
   * @param {object} opts
   * @param {() => object} opts.getContextInfo
   * @param {(data: object) => void} opts.onSendP2P
   * @param {() => any} opts.getPeerInstance
   * @param {(msg: string) => void} opts.onShowToast
   * @param {any} [opts.audio]
   */
  constructor({ getContextInfo, onSendP2P, getPeerInstance, onShowToast, audio }) {
    this.getContextInfo = getContextInfo;
    this.onSendP2P = onSendP2P;
    this.getPeerInstance = getPeerInstance;
    this.onShowToast = onShowToast;
    this.audio = audio;

    // Estados da chamada de voz:
    // 'idle' | 'requesting' | 'incoming' | 'connected' | 'muted'
    this.state = 'idle';
    this.hasRejectedDot = false;

    // Streams e MediaConnection
    this.localStream = null;
    this.remoteStream = null;
    this.remoteAudioEl = null;
    this.currentCall = null;
    this.outgoingPeerId = null;

    // Timer de timeout da solicitação
    this.requestTimeout = null;

    this.initDOM();
    this.initEvents();
  }

  initDOM() {
    this.btnVoice = document.getElementById('btn-voice');
    this.voiceDot = document.getElementById('voice-dot');
    this.banner = document.getElementById('voice-request-banner');
    this.bannerMsg = document.getElementById('voice-banner-msg');
    this.btnAccept = document.getElementById('btn-voice-accept');
    this.btnReject = document.getElementById('btn-voice-reject');
  }

  initEvents() {
    if (this.btnVoice) {
      this.btnVoice.addEventListener('click', () => this.handleVoiceButtonClick());
    }
    if (this.btnAccept) {
      this.btnAccept.addEventListener('click', () => this.acceptIncomingRequest());
    }
    if (this.btnReject) {
      this.btnReject.addEventListener('click', () => this.rejectIncomingRequest());
    }
  }

  /**
   * Atualiza a visibilidade do botão no topo.
   * Só deve aparecer quando houver uma partida multiplayer ativa conectada.
   */
  updateVisibility(isInMatch, isMultiplayer) {
    if (!this.btnVoice) return;
    if (isInMatch && isMultiplayer) {
      this.btnVoice.classList.remove('hidden');
    } else {
      this.btnVoice.classList.add('hidden');
      this.hideBanner();
    }
  }

  /**
   * Trata o clique no botão de voz do menu superior
   */
  async handleVoiceButtonClick() {
    // Se havia o dot vermelho de recusa, limpa no clique
    if (this.hasRejectedDot) {
      this.clearRejectDot();
    }

    const ctx = this.getContextInfo();
    if (!ctx.isConnected || !ctx.isInMatch) {
      this.onShowToast('A transmissão de voz está disponível apenas durante partidas online.');
      return;
    }

    // Se estiver conectado: alterna entre mutado e transmitindo
    if (this.state === 'connected') {
      this.setMuted(true);
      return;
    }
    if (this.state === 'muted') {
      this.setMuted(false);
      return;
    }

    // Se estiver solicitando: cancela a solicitação
    if (this.state === 'requesting') {
      this.cancelOutgoingRequest();
      return;
    }

    // Se estiver recebendo solicitação: abre o banner novamente se estiver fechado
    if (this.state === 'incoming') {
      this.showBanner();
      return;
    }

    // Estado 'idle': iniciar solicitação de voz
    await this.startVoiceRequest();
  }

  /**
   * Inicia o fluxo de pedir voz ao oponente
   */
  async startVoiceRequest() {
    const ctx = this.getContextInfo();
    if (!ctx.oppPeerId) {
      this.onShowToast('Aguardando conexão com o oponente...');
      return;
    }

    // Solicita permissão prévia do microfone para garantir que o usuário pode falar
    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      }
    } catch (err) {
      console.warn('Erro ao acessar microfone:', err);
      this.onShowToast('Permissão de microfone necessária para o chat de voz.');
      return;
    }

    this.state = 'requesting';
    this.updateButtonUI();
    this.outgoingPeerId = ctx.oppPeerId;

    this.onSendP2P({
      type: 'VOICE_REQUEST',
      from: ctx.myPeerId,
      senderName: ctx.myName || 'Oponente'
    });

    this.onShowToast('Solicitação de voz enviada. Aguardando aprovação...');

    clearTimeout(this.requestTimeout);
    this.requestTimeout = setTimeout(() => {
      if (this.state === 'requesting') {
        this.cancelOutgoingRequest('Oponente não respondeu ao convite de voz.');
      }
    }, 20000);
  }

  /**
   * Cancela solicitação enviada
   */
  cancelOutgoingRequest(toastMsg = null) {
    clearTimeout(this.requestTimeout);
    const ctx = this.getContextInfo();
    if (this.state === 'requesting' && ctx.isConnected) {
      this.onSendP2P({
        type: 'VOICE_CANCEL',
        from: ctx.myPeerId
      });
    }
    this.state = 'idle';
    this.stopLocalStream();
    this.updateButtonUI();
    if (toastMsg) this.onShowToast(toastMsg);
  }

  /**
   * Recebeu solicitação do oponente
   */
  handleIncomingRequest(data) {
    if (this.state === 'connected' || this.state === 'muted') {
      // Já está em chamada
      return;
    }

    this.state = 'incoming';
    this.updateButtonUI();
    const sender = data.senderName || 'Oponente';
    if (this.bannerMsg) {
      this.bannerMsg.textContent = `${sender} quer iniciar um chat de voz`;
    }
    this.showBanner();
    if (this.audio && this.audio.playChatNotificationSound) {
      this.audio.playChatNotificationSound();
    }
  }

  /**
   * Aceita a solicitação de voz recebida
   */
  async acceptIncomingRequest() {
    this.hideBanner();
    const ctx = this.getContextInfo();

    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      }
    } catch (err) {
      console.warn('Erro ao obter microfone:', err);
      this.onShowToast('Não foi possível acessar o microfone.');
      this.rejectIncomingRequest();
      return;
    }

    this.state = 'connected';
    this.updateButtonUI();

    // Notifica o oponente que aceitou
    this.onSendP2P({
      type: 'VOICE_ACCEPT',
      from: ctx.myPeerId
    });

    this.onShowToast('Chat de voz iniciado!');
  }

  /**
   * Recusa a solicitação de voz recebida
   */
  rejectIncomingRequest() {
    this.hideBanner();
    const ctx = this.getContextInfo();
    if (ctx.isConnected) {
      this.onSendP2P({
        type: 'VOICE_REJECT',
        from: ctx.myPeerId
      });
    }
    this.state = 'idle';
    this.stopLocalStream();
    this.updateButtonUI();
  }

  /**
   * Oponente aceitou nossa solicitação: estabelece a ligação WebRTC PeerJS
   */
  async handleVoiceAccepted(fromPeerId) {
    clearTimeout(this.requestTimeout);
    if (this.state !== 'requesting') return;

    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      }
    } catch (err) {
      this.onShowToast('Microfone indisponível.');
      this.endVoiceCall();
      return;
    }

    const peer = this.getPeerInstance();
    if (!peer || peer.destroyed) {
      this.onShowToast('Erro na conexão de voz.');
      this.endVoiceCall();
      return;
    }

    const targetId = fromPeerId || this.outgoingPeerId;
    if (!targetId) {
      this.endVoiceCall();
      return;
    }

    // Faz a chamada de mídia via PeerJS
    const call = peer.call(targetId, this.localStream);
    if (!call) {
      this.onShowToast('Falha ao conectar canal de áudio.');
      this.endVoiceCall();
      return;
    }

    this.setupCallEvents(call);
    this.state = 'connected';
    this.updateButtonUI();
    this.onShowToast('Chat de voz conectado!');
  }

  /**
   * Oponente recusou nossa solicitação: ativa dot vermelho no ícone de microfone
   */
  handleVoiceRejected() {
    clearTimeout(this.requestTimeout);
    this.state = 'idle';
    this.stopLocalStream();
    this.showRejectDot();
    this.updateButtonUI();
    this.onShowToast('Oponente recusou o chat de voz.');
  }

  /**
   * Oponente cancelou a solicitação antes de aceitarmos
   */
  handleVoiceCancelled() {
    if (this.state === 'incoming') {
      this.hideBanner();
      this.state = 'idle';
      this.stopLocalStream();
      this.updateButtonUI();
      this.onShowToast('Solicitação de voz cancelada pelo oponente.');
    }
  }

  /**
   * Recebimento de chamada de mídia do PeerJS
   */
  handleIncomingPeerCall(call) {
    if (!call) return;

    // Se já temos a stream local pronta (aceitamos a requisição)
    if (this.localStream) {
      call.answer(this.localStream);
      this.setupCallEvents(call);
      this.state = 'connected';
      this.updateButtonUI();
    } else {
      // Caso a chamada chegue no momento do handshake
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      }).then((stream) => {
        this.localStream = stream;
        call.answer(stream);
        this.setupCallEvents(call);
        this.state = 'connected';
        this.updateButtonUI();
      }).catch(() => {
        try { call.close(); } catch (e) {}
      });
    }
  }

  /**
   * Configura eventos da chamada de mídia PeerJS
   */
  setupCallEvents(call) {
    this.currentCall = call;

    call.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;
      this.playRemoteAudio(remoteStream);
    });

    call.on('close', () => {
      this.endVoiceCall(false);
    });

    call.on('error', (err) => {
      console.warn('Voice call error:', err);
      this.endVoiceCall(false);
    });
  }

  playRemoteAudio(stream) {
    if (!this.remoteAudioEl) {
      this.remoteAudioEl = document.createElement('audio');
      this.remoteAudioEl.autoplay = true;
      this.remoteAudioEl.style.display = 'none';
      document.body.appendChild(this.remoteAudioEl);
    }
    this.remoteAudioEl.srcObject = stream;
    this.remoteAudioEl.play().catch((err) => {
      console.warn('Autoplay bloqueado pelo navegador para voz:', err);
    });
  }

  /**
   * Alterna entre Mutado e Transmitindo
   */
  setMuted(muted) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    this.state = muted ? 'muted' : 'connected';
    this.updateButtonUI();
    this.onShowToast(muted ? 'Microfone mutado' : 'Microfone ativo');
  }

  /**
   * Finaliza o chat de voz
   */
  endVoiceCall(notifyPeer = true) {
    clearTimeout(this.requestTimeout);
    if (notifyPeer) {
      const ctx = this.getContextInfo();
      if (ctx.isConnected) {
        this.onSendP2P({
          type: 'VOICE_END',
          from: ctx.myPeerId
        });
      }
    }

    if (this.currentCall) {
      try { this.currentCall.close(); } catch (e) {}
      this.currentCall = null;
    }

    this.stopLocalStream();

    if (this.remoteAudioEl) {
      try {
        this.remoteAudioEl.pause();
        this.remoteAudioEl.srcObject = null;
      } catch (e) {}
    }
    this.remoteStream = null;

    this.hideBanner();
    this.state = 'idle';
    this.updateButtonUI();
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      this.localStream = null;
    }
  }

  showBanner() {
    if (this.banner) {
      this.banner.classList.remove('hidden');
    }
  }

  hideBanner() {
    if (this.banner) {
      this.banner.classList.add('hidden');
    }
  }

  showRejectDot() {
    this.hasRejectedDot = true;
    if (this.voiceDot) {
      this.voiceDot.classList.remove('hidden');
    }
  }

  clearRejectDot() {
    this.hasRejectedDot = false;
    if (this.voiceDot) {
      this.voiceDot.classList.add('hidden');
    }
  }

  /**
   * Atualiza as classes visuais e ícones do botão de microfone
   */
  updateButtonUI() {
    if (!this.btnVoice) return;

    // Reseta classes de estado
    this.btnVoice.classList.remove('voice-requesting', 'voice-connected', 'voice-muted');

    const iconUnmuted = document.getElementById('icon-voice-unmuted');
    const iconMuted = document.getElementById('icon-voice-muted');

    if (this.state === 'requesting') {
      this.btnVoice.classList.add('voice-requesting');
      this.btnVoice.title = 'Solicitando voz... (clique para cancelar)';
      if (iconUnmuted) iconUnmuted.classList.remove('hidden');
      if (iconMuted) iconMuted.classList.add('hidden');
    } else if (this.state === 'connected') {
      this.btnVoice.classList.add('voice-connected');
      this.btnVoice.title = 'Voz ativa: transmitindo (clique para mutar)';
      if (iconUnmuted) iconUnmuted.classList.remove('hidden');
      if (iconMuted) iconMuted.classList.add('hidden');
    } else if (this.state === 'muted') {
      this.btnVoice.classList.add('voice-muted');
      this.btnVoice.title = 'Voz mutada (clique para ativar)';
      if (iconUnmuted) iconUnmuted.classList.add('hidden');
      if (iconMuted) iconMuted.classList.remove('hidden');
    } else {
      this.btnVoice.title = 'Iniciar chat de voz';
      if (iconUnmuted) iconUnmuted.classList.remove('hidden');
      if (iconMuted) iconMuted.classList.add('hidden');
    }
  }

  /**
   * Reinicia o estado ao voltar ao lobby ou desconectar
   */
  reset() {
    this.endVoiceCall(false);
    this.clearRejectDot();
    this.hideBanner();
    this.state = 'idle';
    this.updateButtonUI();
  }
}

