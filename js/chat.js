/**
 * Módulo de Chat da Partida
 * Responsável exclusivamente pelo overlay de chat, histórico de mensagens, badge de não lidas e envio P2P/Solo.
 */

export class ChatManager {
  constructor({ audio, getContextInfo, onSendP2P }) {
    this.audio = audio;
    this.getContextInfo = getContextInfo;
    this.onSendP2P = onSendP2P;

    this.unreadMessagesCount = 0;
    this.isChatOpen = false;

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
  }

  initEvents() {
    if (this.btnChat) this.btnChat.addEventListener('click', () => this.toggle());
    if (this.btnCloseChat) this.btnCloseChat.addEventListener('click', () => this.toggle(false));
    if (this.chatForm) {
      this.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
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
      this.chatOverlay.classList.add('hidden');
      if (this.chatInput) {
        this.chatInput.blur();
      }
    }
  }

  reset() {
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
    if (!data || !data.text) return;

    const { oppName } = this.getContextInfo();
    const timeStr = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sender = data.sender || oppName || 'Oponente';

    this.appendMessage(sender, data.text, timeStr, 'received');

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
}

