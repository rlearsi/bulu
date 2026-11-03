/**
 * Módulo de Chat da Partida
 * Responsável exclusivamente pelo overlay de chat, histórico de mensagens, gravação de áudio de até 3s, badge de não lidas e envio P2P/Solo.
 */

export class ChatManager {
  constructor({ audio, getContextInfo, onSendP2P, onShowToast }) {
    this.audio = audio;
    this.getContextInfo = getContextInfo;
    this.onSendP2P = onSendP2P;
    this.onShowToast = onShowToast;

    this.unreadMessagesCount = 0;
    this.isChatOpen = false;

    // Estado de gravação de áudio (máximo de 3 segundos)
    this.maxAudioMs = 3000;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingStream = null;
    this.recordingTimeout = null;
    this.recordingInterval = null;
    this.recordingStartTime = 0;
    this.shouldSendRecordedAudio = false;
    this.activeAudioElement = null;

    this.initDOM();
    this.initEvents();
  }

  initDOM() {
    this.btnChat = document.getElementById('btn-chat');
    this.chatBadge = document.getElementById('chat-badge');
    this.chatOverlay = document.getElementById('chat-overlay');
    this.btnCloseChat = document.getElementById('btn-close-chat');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.btnChatMic = document.getElementById('btn-chat-mic');
    this.chatMicTimer = document.getElementById('chat-mic-timer');
  }

  initEvents() {
    if (this.btnChat) this.btnChat.addEventListener('click', () => this.toggle());
    if (this.btnCloseChat) this.btnCloseChat.addEventListener('click', () => this.toggle(false));
    if (this.btnChatMic) {
      this.btnChatMic.addEventListener('click', () => this.handleMicButtonClick());
    }
    if (this.chatForm) {
      this.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.isRecording) {
          this.stopRecordingAndSend();
          return;
        }
        this.handleSendMessage();
      });
    }
  }

  toggle(forceOpen = null) {
    if (!this.chatOverlay) return;

    if (forceOpen === null) {
      this.isChatOpen = !this.isChatOpen;
    } else {
      this.isChatOpen = !!forceOpen;
    }

    if (this.isChatOpen) {
      this.chatOverlay.classList.remove('hidden');
      this.unreadMessagesCount = 0;
      this.updateBadge();
      if (this.chatInput) {
        setTimeout(() => this.chatInput.focus(), 80);
      }
      this.scrollToBottom();
    } else {
      this.cancelRecording();
      this.chatOverlay.classList.add('hidden');
      if (this.chatInput) {
        this.chatInput.blur();
      }
    }
  }

  reset() {
    this.cancelRecording();
    this.toggle(false);
    this.unreadMessagesCount = 0;
    this.updateBadge();
  }

  updateBadge() {
    if (!this.chatBadge) return;
    if (this.unreadMessagesCount > 0) {
      this.chatBadge.textContent = this.unreadMessagesCount > 99 ? '99+' : this.unreadMessagesCount;
      this.chatBadge.classList.remove('hidden');
    } else {
      this.chatBadge.classList.add('hidden');
      this.chatBadge.textContent = '0';
    }
  }

  scrollToBottom() {
    if (!this.chatMessages) return;
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  // ==========================================
  // GRAVAÇÃO E ENVIO DE ÁUDIO CURTO (ATÉ 3S)
  // ==========================================
  async handleMicButtonClick() {
    if (this.isRecording) {
      this.stopRecordingAndSend();
      return;
    }
    await this.startRecording();
  }

  getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  async startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (this.onShowToast) this.onShowToast('Gravação de áudio não suportada neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordingStream = stream;
      this.audioChunks = [];
      this.shouldSendRecordedAudio = true;

      const mimeType = this.getSupportedMimeType();
      const options = mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 };
      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const durationMs = Math.min(this.maxAudioMs, Math.max(500, Date.now() - this.recordingStartTime));
        const shouldSend = this.shouldSendRecordedAudio;
        const chunks = [...this.audioChunks];
        const recMime = (this.mediaRecorder && this.mediaRecorder.mimeType) || mimeType || 'audio/webm';

        this.cleanupRecordingResources();

        if (!shouldSend || chunks.length === 0) return;

        const blob = new Blob(chunks, { type: recMime });
        if (blob.size < 100) return;

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          if (typeof base64Audio === 'string' && base64Audio.startsWith('data:audio')) {
            this.sendAudioMessage(base64Audio, Math.ceil(durationMs / 1000));
          }
        };
        reader.readAsDataURL(blob);
      };

      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.updateRecordingUI(true, 3);

      this.mediaRecorder.start();

      this.recordingInterval = setInterval(() => {
        const elapsed = Date.now() - this.recordingStartTime;
        const remainingSec = Math.max(1, Math.ceil((this.maxAudioMs - elapsed) / 1000));
        this.updateRecordingUI(true, remainingSec);
      }, 200);

      // Ao atingir 3 segundos, interrompe a gravação e envia o áudio automaticamente
      this.recordingTimeout = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecordingAndSend();
        }
      }, this.maxAudioMs);
    } catch (err) {
      this.cleanupRecordingResources();
      if (this.onShowToast) {
        this.onShowToast('Permita o acesso ao microfone para enviar áudio.');
      }
    }
  }

  stopRecordingAndSend() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.shouldSendRecordedAudio = true;
    try {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch (e) {
      this.cleanupRecordingResources();
    }
  }

  cancelRecording() {
    if (!this.isRecording && !this.recordingStream) return;
    this.shouldSendRecordedAudio = false;
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        this.cleanupRecordingResources();
      }
    } catch (e) {
      this.cleanupRecordingResources();
    }
  }

  cleanupRecordingResources() {
    this.isRecording = false;
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach((track) => track.stop());
      this.recordingStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.updateRecordingUI(false);
  }

  updateRecordingUI(recording, remainingSec = 3) {
    if (this.btnChatMic) {
      this.btnChatMic.classList.toggle('recording', recording);
    }
    if (this.chatMicTimer) {
      this.chatMicTimer.classList.toggle('hidden', !recording);
      if (recording) {
        this.chatMicTimer.textContent = `${remainingSec}s`;
      }
    }
    if (this.chatInput) {
      this.chatInput.classList.toggle('recording-active', recording);
      this.chatInput.placeholder = recording
        ? `Gravando áudio (${remainingSec}s)...`
        : 'Digite uma mensagem...';
    }
  }

  sendAudioMessage(audioData, durationSec) {
    const { myName, role, isConnected } = this.getContextInfo();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clampedSec = Math.max(1, Math.min(3, durationSec || 3));

    const msgData = {
      type: 'CHAT_MESSAGE',
      sender: myName,
      audioData: audioData,
      audioDuration: clampedSec,
      time: timeStr
    };

    this.appendAudioMessage(msgData.sender, msgData.audioData, msgData.audioDuration, msgData.time, 'sent');

    if (isConnected) {
      if (this.onSendP2P) this.onSendP2P(msgData);
    } else if (role === 'solo') {
      setTimeout(() => {
        this.handleIncomingMessage({
          sender: 'Computador',
          text: 'Ouvi seu áudio! Estou concentrado nas letras!',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }, 700);
    }
  }

  // ==========================================
  // ENVIO E RECEBIMENTO DE MENSAGENS DE TEXTO
  // ==========================================
  handleSendMessage() {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    const { myName, role, isConnected } = this.getContextInfo();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgData = {
      type: 'CHAT_MESSAGE',
      sender: myName,
      text: text,
      time: timeStr
    };

    // Renderiza a mensagem enviada pelo usuário
    this.appendMessage(msgData.sender, msgData.text, msgData.time, 'sent');

    // Se estiver em partida P2P conectada, envia para o oponente
    if (isConnected) {
      if (this.onSendP2P) this.onSendP2P(msgData);
    } else if (role === 'solo') {
      // Resposta automática / amigável em modo solo/treino
      setTimeout(() => {
        this.handleIncomingMessage({
          sender: 'Computador',
          text: 'Estou focado em adivinhar as palavras!',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }, 700);
    }

    this.chatInput.value = '';
    this.chatInput.focus();
  }

  handleIncomingMessage(data) {
    if (!data || (!data.text && !data.audioData)) return;

    const { oppName } = this.getContextInfo();
    const timeStr = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sender = data.sender || oppName || 'Oponente';

    if (data.audioData && typeof data.audioData === 'string' && data.audioData.startsWith('data:audio')) {
      const durationSec = Math.max(1, Math.min(3, Number(data.audioDuration) || 3));
      this.appendAudioMessage(sender, data.audioData, durationSec, timeStr, 'received');
    } else if (data.text) {
      this.appendMessage(sender, data.text, timeStr, 'received');
    }

    if (!this.isChatOpen) {
      this.unreadMessagesCount++;
      this.updateBadge();
      if (this.audio) {
        this.audio.playChatNotificationSound();
      }
    }
  }

  appendMessage(sender, text, time, type = 'received') {
    if (!this.chatMessages) return;

    const row = document.createElement('div');
    row.className = `chat-msg-row ${type}`;

    if (type === 'received') {
      const senderEl = document.createElement('span');
      senderEl.className = 'chat-msg-sender';
      senderEl.textContent = sender;
      row.appendChild(senderEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-msg-time';
    timeEl.textContent = time;
    row.appendChild(timeEl);

    this.chatMessages.appendChild(row);
    this.scrollToBottom();
  }

  appendAudioMessage(sender, audioData, durationSec, time, type = 'received') {
    if (!this.chatMessages) return;

    const row = document.createElement('div');
    row.className = `chat-msg-row ${type}`;

    if (type === 'received') {
      const senderEl = document.createElement('span');
      senderEl.className = 'chat-msg-sender';
      senderEl.textContent = sender;
      row.appendChild(senderEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble chat-audio-bubble';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'chat-audio-play-btn';
    playBtn.title = 'Reproduzir áudio';

    const playSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
    const pauseSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    playBtn.innerHTML = playSvg;

    const track = document.createElement('div');
    track.className = 'chat-audio-track';
    const progress = document.createElement('div');
    progress.className = 'chat-audio-progress';
    track.appendChild(progress);

    const durationLabel = document.createElement('span');
    durationLabel.className = 'chat-audio-duration';
    const formattedDuration = `0:0${Math.max(1, Math.min(3, durationSec || 3))}`;
    durationLabel.textContent = formattedDuration;

    const audioEl = new Audio(audioData);
    audioEl.preload = 'metadata';

    audioEl.addEventListener('timeupdate', () => {
      const total = (Number.isFinite(audioEl.duration) && audioEl.duration > 0) ? audioEl.duration : (durationSec || 3);
      const pct = Math.min(100, (audioEl.currentTime / total) * 100);
      progress.style.width = `${pct}%`;
    });

    const resetPlayerUI = () => {
      playBtn.innerHTML = playSvg;
      progress.style.width = '0%';
      durationLabel.textContent = formattedDuration;
      if (this.activeAudioElement === audioEl) {
        this.activeAudioElement = null;
      }
    };

    audioEl.addEventListener('ended', resetPlayerUI);
    audioEl.addEventListener('pause', () => {
      if (!audioEl.ended) {
        playBtn.innerHTML = playSvg;
      }
    });
    audioEl.addEventListener('play', () => {
      playBtn.innerHTML = pauseSvg;
    });

    playBtn.addEventListener('click', () => {
      if (this.activeAudioElement && this.activeAudioElement !== audioEl) {
        this.activeAudioElement.pause();
        this.activeAudioElement.currentTime = 0;
      }
      if (audioEl.paused) {
        this.activeAudioElement = audioEl;
        audioEl.play().catch(() => {});
      } else {
        audioEl.pause();
      }
    });

    bubble.appendChild(playBtn);
    bubble.appendChild(track);
    bubble.appendChild(durationLabel);
    row.appendChild(bubble);

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-msg-time';
    timeEl.textContent = time;
    row.appendChild(timeEl);

    this.chatMessages.appendChild(row);
    this.scrollToBottom();
  }
}
