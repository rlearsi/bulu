/**
 * Módulo de Perfil do Jogador
 * Responsável exclusivamente por apelidos aleatórios, avatar Base64 (crop 128x128), LocalStorage e modal de perfil.
 */

export class ProfileManager {
  constructor({ onShowToast, onProfileUpdated }) {
    this.onShowToast = onShowToast;
    this.onProfileUpdated = onProfileUpdated;

    // Gerador de Apelidos Aleatórios (máx 12 caracteres)
    this.randomNickPool = [
      'Juvenal', 'Astolfo', 'Bartolomeu', 'Epaminondas', 'Teobaldo', 'Godofredo',
      'Valdomiro', 'Clementina', 'Genoveva', 'Mafalda', 'Filomena', 'Serafim',
      'ZéPequeno', 'PomboSujo', 'Capivara', 'Calabreso', 'Mussarelo', 'Biscoito',
      'Coxinha', 'Paçoca', 'Pamonha', 'Brigadeiro', 'Tucano', 'Guaxinim',
      'Camaleão', 'Sabichão', 'MestreZen', 'Relâmpago', 'Fofoqueiro', 'Sonolento',
      'Preguiça', 'Soneca', 'Pipoca', 'Azeitona', 'Pimentinha', 'Abacate',
      'Tangerina', 'Maracujá', 'Cajuína', 'Rapadura', 'Farofa', 'Tapioca',
      'Curupira', 'SaciPererê', 'BotoRosa', 'Mandachuva', 'PéDeVento', 'ZigueZague',
      'Berenice', 'Gertrudes', 'Gumercindo', 'Orozimbo', 'Tibúrcio', 'Quitéria',
      'Fulgêncio', 'Eustáquio', 'Ludovico', 'Virgulino', 'Lampião', 'Cangaceiro',
      'Tropeiro', 'Garimpeiro', 'Alquimista', 'Astronauta', 'Detetive', 'Forasteiro'
    ];

    const savedName = localStorage.getItem('termo_player_name');
    this.isNameSaved = Boolean(savedName && savedName.trim());
    this.myName = this.isNameSaved ? savedName.trim() : this.generateRandomNickname();
    this.myAvatar = localStorage.getItem('termo_player_avatar') || '';
    this.tempAvatar = this.myAvatar;

    this.initDOM();
    this.initEvents();
    this.updateProfileDisplay();
  }

  initDOM() {
    this.homeAvatarImg = document.getElementById('home-avatar-img');
    this.homeAvatarPh = document.getElementById('home-avatar-ph');
    this.homePlayerName = document.getElementById('home-player-name');
    this.lobbyAvatarTrigger = document.getElementById('lobby-avatar-trigger');
    this.btnQuickEditName = document.getElementById('btn-quick-edit-name');

    this.profileModal = document.getElementById('profile-modal');
    this.btnProfile = document.getElementById('btn-profile');
    this.btnCloseProfile = document.getElementById('btn-close-profile');
    this.modalAvatarTrigger = document.getElementById('modal-avatar-trigger');
    this.modalAvatarPreview = document.getElementById('modal-avatar-preview');
    this.modalAvatarPlaceholder = document.getElementById('modal-avatar-placeholder');
    this.btnRemoveAvatar = document.getElementById('btn-remove-avatar');
    this.inputAvatarFile = document.getElementById('input-avatar-file');
    this.inputProfileName = document.getElementById('input-profile-name');
    this.btnModalRandomName = document.getElementById('btn-modal-random-name');
    this.btnSaveProfile = document.getElementById('btn-save-profile');
  }

  initEvents() {
    if (this.btnProfile) this.btnProfile.addEventListener('click', () => this.showModal(true));
    if (this.btnCloseProfile) this.btnCloseProfile.addEventListener('click', () => this.showModal(false));
    if (this.lobbyAvatarTrigger) this.lobbyAvatarTrigger.addEventListener('click', () => this.showModal(true));
    if (this.btnQuickEditName) this.btnQuickEditName.addEventListener('click', () => this.showModal(true));
    if (this.modalAvatarTrigger) this.modalAvatarTrigger.addEventListener('click', () => this.inputAvatarFile.click());
    if (this.inputAvatarFile) this.inputAvatarFile.addEventListener('change', (e) => this.handleAvatarFileSelect(e));
    if (this.btnRemoveAvatar) this.btnRemoveAvatar.addEventListener('click', () => this.handleAvatarRemove());
    if (this.btnModalRandomName) this.btnModalRandomName.addEventListener('click', () => this.handleModalRandomNickname());
    if (this.btnSaveProfile) this.btnSaveProfile.addEventListener('click', () => this.handleSaveProfile());
  }

  isModalOpen() {
    return Boolean(this.profileModal && this.profileModal.offsetParent !== null);
  }

  generateRandomNickname(currentName = '') {
    const pool = this.randomNickPool || ['Juvenal', 'Astolfo', 'Calabreso', 'Capivara'];
    const candidates = pool.filter(n => n.toLowerCase() !== (currentName || '').toLowerCase());
    const list = candidates.length > 0 ? candidates : pool;
    const picked = list[Math.floor(Math.random() * list.length)];
    return picked.slice(0, 12);
  }

  handleModalRandomNickname() {
    const currentVal = this.inputProfileName ? this.inputProfileName.value.trim() : this.myName;
    const nextNick = this.generateRandomNickname(currentVal);
    if (this.inputProfileName) {
      this.inputProfileName.value = nextNick;
      this.inputProfileName.focus();
    }
  }

  static renderAvatarElement(imgEl, phEl, avatarData) {
    if (!imgEl || !phEl) return;
    if (avatarData) {
      imgEl.src = avatarData;
      imgEl.classList.remove('hidden');
      phEl.classList.add('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
      phEl.classList.remove('hidden');
    }
  }

  updateProfileDisplay() {
    if (this.homePlayerName) this.homePlayerName.textContent = this.myName;
    ProfileManager.renderAvatarElement(this.homeAvatarImg, this.homeAvatarPh, this.myAvatar);
    if (this.inputProfileName) this.inputProfileName.value = this.myName;
    this.updateModalAvatarPreview();
  }

  updateModalAvatarPreview() {
    ProfileManager.renderAvatarElement(this.modalAvatarPreview, this.modalAvatarPlaceholder, this.tempAvatar);
    if (this.btnRemoveAvatar) {
      if (this.tempAvatar) {
        this.btnRemoveAvatar.classList.remove('hidden');
      } else {
        this.btnRemoveAvatar.classList.add('hidden');
      }
    }
  }

  showModal(show) {
    if (!this.profileModal) return;
    if (show) {
      this.tempAvatar = this.myAvatar;
      if (this.inputProfileName) this.inputProfileName.value = this.myName;
      this.updateModalAvatarPreview();
      this.profileModal.classList.remove('hidden');
    } else {
      this.profileModal.classList.add('hidden');
    }
  }

  handleAvatarFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (this.onShowToast) this.onShowToast('Por favor, selecione um arquivo de imagem.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensiona para avatar leve (128x128 max) em canvas
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Crop centralizado proporcional
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        this.tempAvatar = canvas.toDataURL('image/jpeg', 0.85);
        this.updateModalAvatarPreview();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Permite selecionar o mesmo arquivo novamente
  }

  handleAvatarRemove() {
    this.tempAvatar = '';
    this.updateModalAvatarPreview();
  }

  handleSaveProfile() {
    const newName = this.inputProfileName ? this.inputProfileName.value.trim() : '';
    this.myName = newName || this.generateRandomNickname(this.myName);
    this.myAvatar = this.tempAvatar;
    this.isNameSaved = true;

    try {
      localStorage.setItem('termo_player_name', this.myName);
      localStorage.setItem('termo_player_avatar', this.myAvatar);
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }

    this.updateProfileDisplay();
    if (this.onProfileUpdated) {
      this.onProfileUpdated(this.myName, this.myAvatar);
    }

    this.showModal(false);
    if (this.onShowToast) this.onShowToast('Perfil salvo com sucesso! ✓');
  }
}

