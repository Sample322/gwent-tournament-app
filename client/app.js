// ===== GWENT Tournament App =====

// Данные фракций с изображениями
const FACTIONS = [
  { id: 'monsters', name: 'Монстры', image: 'images/monsters.png' },
  { id: 'nilfgaard', name: 'Нильфгаард', image: 'images/nilfgaard.png' },
  { id: 'northern', name: 'Северные Королевства', image: 'images/northern-realms.png' },
  { id: 'scoiatael', name: "Скоя'таэли", image: 'images/scoia-tael.png' },
  { id: 'skellige', name: 'Скеллиге', image: 'images/skellige.png' },
  { id: 'syndicate', name: 'Синдикат', image: 'images/syndicate.png' }
];

// ===== App State =====
const AppState = {
  currentPage: 'home',
  socket: null,
  lobby: null,
  player: {
    id: null,
    name: ''
  },
  isCreator: false,
  tournamentFormat: 'bo3',
  
  // Local selection state
  localSelectedFactions: [],
  localBannedFaction: null,
  
  // Server state
  creatorSelectedFactions: [],
  opponentSelectedFactions: [],
  creatorBannedFaction: null,
  opponentBannedFaction: null,
  
  // Confirmation flags
  selectionConfirmed: false,
  banConfirmed: false,
  opponentConfirmed: false,
  
  // Timers
  timer: null,
  timerValue: 0,
  
  // Progress tracking
  opponentProgress: 0
};

// ===== Utility Functions =====
const Utils = {
  generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  },
  
  getRequiredFactions(format) {
    return format === 'bo5' ? 4 : 3;
  },
  
  coinFlip(lobbyCode) {
    let hash = 0;
    for (let i = 0; i < lobbyCode.length; i++) {
      hash = ((hash << 5) - hash) + lobbyCode.charCodeAt(i);
      hash |= 0;
    }
    return hash % 2 === 0;
  },
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },
  
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
};

// ===== Toast Notifications =====
const Toast = {
  show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

// ===== Socket Manager =====
const SocketManager = {
  connect() {
    const serverUrl = window.location.origin;
    AppState.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    this.setupListeners();
  },
  
  setupListeners() {
    const socket = AppState.socket;
    
    socket.on('connect', () => {
      console.log('Connected to server');
      if (AppState.lobby?.lobbyCode) {
        socket.emit('join-lobby', {
          lobbyCode: AppState.lobby.lobbyCode,
          playerId: AppState.player.id,
          playerName: AppState.player.name
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected');
      Toast.error('Соединение потеряно...');
    });
    
    socket.on('player-joined', (data) => {
      Toast.success(`${data.playerName} присоединился!`);
    });
    
    socket.on('lobby-update', (lobby) => {
      this.handleLobbyUpdate(lobby);
    });
    
    socket.on('error', (data) => {
      Toast.error(data.message || 'Ошибка');
    });
    
    socket.on('faction-selection-started', () => {
      AppState.timerValue = 300;
      AppState.selectionConfirmed = false;
      AppState.opponentConfirmed = false;
      AppState.localSelectedFactions = [];
      Renderer.renderPage('select-factions');
      this.startTimer();
    });
    
    socket.on('opponent-selection-progress', (data) => {
      AppState.opponentProgress = data.selectionsCount || 0;
      Renderer.updateOpponentProgress();
    });
    
    socket.on('selection-confirmed', (data) => {
      if (data.success) {
        AppState.selectionConfirmed = true;
        Renderer.updateConfirmationStatus();
        Toast.success('Выбор подтверждён!');
      }
    });
    
    socket.on('player-selection-status', (data) => {
      if (data.playerId !== AppState.player.id) {
        if (data.status === 'completed') {
          AppState.opponentConfirmed = true;
          Toast.info('Оппонент подтвердил выбор');
        }
      }
    });
    
    socket.on('phase-changed', (data) => {
      if (data.phase === 'banning') {
        this.stopTimer();
        AppState.timerValue = 180;
        AppState.banConfirmed = false;
        AppState.opponentConfirmed = false;
        AppState.localBannedFaction = null;
        Renderer.renderPage('ban-phase');
        this.startTimer();
      }
    });
    
    socket.on('ban-confirmed', (data) => {
      if (data.success) {
        AppState.banConfirmed = true;
        Renderer.updateConfirmationStatus();
        Toast.success('Бан подтверждён!');
      }
    });
    
    socket.on('ban-phase-ended', () => {
      this.stopTimer();
      Renderer.renderPage('match-results');
    });
    
    socket.on('lobby-reset', () => {
      AppState.localSelectedFactions = [];
      AppState.localBannedFaction = null;
      AppState.selectionConfirmed = false;
      AppState.banConfirmed = false;
      AppState.opponentConfirmed = false;
      Renderer.renderPage('lobby');
      Toast.info('Лобби сброшено');
    });
    
    socket.on('player-disconnected', () => {
      Toast.error('Оппонент отключился');
    });
    
    socket.on('player-reconnected', () => {
      Toast.success('Оппонент вернулся');
    });
  },
  
  handleLobbyUpdate(lobby) {
    AppState.lobby = lobby;
    AppState.tournamentFormat = lobby.tournamentFormat || 'bo3';
    AppState.creatorSelectedFactions = lobby.creatorSelectedFactions || [];
    AppState.opponentSelectedFactions = lobby.opponentSelectedFactions || [];
    AppState.creatorBannedFaction = lobby.creatorBannedFaction;
    AppState.opponentBannedFaction = lobby.opponentBannedFaction;
    
    if (AppState.currentPage === 'lobby' || AppState.currentPage === 'match-results') {
      Renderer.renderPage(AppState.currentPage);
    }
  },
  
  startTimer() {
    this.stopTimer();
    AppState.timer = setInterval(() => {
      AppState.timerValue--;
      Renderer.updateTimer();
      if (AppState.timerValue <= 0) {
        this.stopTimer();
        this.handleTimerExpired();
      }
    }, 1000);
  },
  
  stopTimer() {
    if (AppState.timer) {
      clearInterval(AppState.timer);
      AppState.timer = null;
    }
  },
  
  handleTimerExpired() {
    if (AppState.currentPage === 'select-factions' && !AppState.selectionConfirmed) {
      const required = Utils.getRequiredFactions(AppState.tournamentFormat);
      while (AppState.localSelectedFactions.length < required) {
        const available = FACTIONS.filter(f => !AppState.localSelectedFactions.includes(f.id));
        if (available.length > 0) {
          AppState.localSelectedFactions.push(available[0].id);
        } else break;
      }
      this.confirmSelection();
    } else if (AppState.currentPage === 'ban-phase' && !AppState.banConfirmed) {
      const opponentFactions = AppState.isCreator 
        ? AppState.opponentSelectedFactions 
        : AppState.creatorSelectedFactions;
      if (opponentFactions.length > 0 && !AppState.localBannedFaction) {
        AppState.localBannedFaction = opponentFactions[0];
      }
      this.confirmBan();
    }
  },
  
  async createLobby(playerName, format) {
    AppState.player.id = AppState.player.id || Utils.generatePlayerId();
    AppState.player.name = playerName;
    AppState.tournamentFormat = format;
    
    try {
      const response = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: AppState.player,
          tournamentFormat: format
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        Toast.error(error.message || 'Ошибка создания');
        return;
      }
      
      const lobby = await response.json();
      AppState.lobby = lobby;
      AppState.isCreator = true;
      
      AppState.socket.emit('join-lobby', {
        lobbyCode: lobby.lobbyCode,
        playerId: AppState.player.id,
        playerName: AppState.player.name
      });
      
      Renderer.renderPage('lobby');
      Toast.success('Лобби создано!');
    } catch (error) {
      console.error('Create error:', error);
      Toast.error('Ошибка сети');
    }
  },
  
  async joinLobby(playerName, code) {
    AppState.player.id = AppState.player.id || Utils.generatePlayerId();
    AppState.player.name = playerName;
    
    try {
      const response = await fetch(`/api/lobbies/${code.toUpperCase()}/join`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: AppState.player.id,
          playerName: AppState.player.name
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        Toast.error(error.message || 'Ошибка');
        return;
      }
      
      const lobby = await response.json();
      AppState.lobby = lobby;
      AppState.isCreator = lobby.creator?.id === AppState.player.id;
      AppState.tournamentFormat = lobby.tournamentFormat;
      
      AppState.socket.emit('join-lobby', {
        lobbyCode: lobby.lobbyCode,
        playerId: AppState.player.id,
        playerName: AppState.player.name
      });
      
      Renderer.renderPage('lobby');
      Toast.success('Присоединились!');
    } catch (error) {
      console.error('Join error:', error);
      Toast.error('Ошибка сети');
    }
  },
  
  startGame() {
    AppState.socket.emit('start-faction-selection', {
      lobbyCode: AppState.lobby.lobbyCode
    });
  },
  
  saveSelectionProgress: Utils.debounce(function() {
    if (!AppState.lobby?.lobbyCode) return;
    AppState.socket.emit('save-selection-progress', {
      lobbyCode: AppState.lobby.lobbyCode,
      playerId: AppState.player.id,
      selections: AppState.localSelectedFactions,
      phase: 'selecting'
    });
  }, 500),
  
  confirmSelection() {
    if (AppState.selectionConfirmed) return;
    AppState.socket.emit('confirm-faction-selection', {
      lobbyCode: AppState.lobby.lobbyCode,
      playerId: AppState.player.id,
      selectedFactions: AppState.localSelectedFactions
    });
  },
  
  confirmBan() {
    if (AppState.banConfirmed) return;
    AppState.socket.emit('confirm-faction-ban', {
      lobbyCode: AppState.lobby.lobbyCode,
      playerId: AppState.player.id,
      bannedFaction: AppState.localBannedFaction
    });
  },
  
  resetLobby() {
    AppState.socket.emit('reset-lobby', {
      lobbyCode: AppState.lobby.lobbyCode
    });
  },
  
  leaveLobby() {
    AppState.lobby = null;
    Renderer.renderPage('home');
  }
};

// ===== Renderer =====
const Renderer = {
  renderPage(page) {
    AppState.currentPage = page;
    const app = document.getElementById('app');
    if (!app) return;
    
    let html = '';
    switch(page) {
      case 'home':
        html = this.renderHomePage();
        break;
      case 'create-lobby':
        html = this.renderCreateLobbyPage();
        break;
      case 'join-lobby':
        html = this.renderJoinLobbyPage();
        break;
      case 'lobby':
        html = this.renderLobbyPage();
        break;
      case 'select-factions':
        html = this.renderSelectFactionsPage();
        break;
      case 'ban-phase':
        html = this.renderBanPhasePage();
        break;
      case 'match-results':
        html = this.renderMatchResultsPage();
        break;
    }
    
    app.innerHTML = html;
    this.attachEventListeners();
  },
  
  renderHomePage() {
    return `
      <div class="page home-page">
        <div class="logo-container">
          <img src="images/gwent-logo.png" alt="GWENT" class="logo">
        </div>
        <h1 class="title title-large">GWENT</h1>
        <p class="subtitle">Турнирный помощник</p>
        <div class="home-buttons">
          <button class="btn btn-primary" data-action="goto-create">
            Создать лобби
          </button>
          <button class="btn btn-secondary" data-action="goto-join">
            Присоединиться
          </button>
        </div>
      </div>
    `;
  },
  
  renderCreateLobbyPage() {
    return `
      <div class="page">
        <h1 class="title title-medium">Создать лобби</h1>
        
        <div class="form-group">
          <label class="form-label">Ваше имя</label>
          <input type="text" class="form-input" id="player-name" placeholder="Введите имя" maxlength="20">
        </div>
        
        <div class="form-group">
          <label class="form-label">Формат турнира</label>
          <div class="format-grid">
            <label class="format-card selected" data-format="bo3">
              <input type="radio" name="format" value="bo3" checked>
              <div class="format-title">Bo3</div>
              <div class="format-desc">3 фракции</div>
            </label>
            <label class="format-card" data-format="bo5">
              <input type="radio" name="format" value="bo5">
              <div class="format-title">Bo5</div>
              <div class="format-desc">4 фракции</div>
            </label>
          </div>
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="goto-home">Назад</button>
          <button class="btn btn-primary" data-action="create-lobby">Создать</button>
        </div>
      </div>
    `;
  },
  
  renderJoinLobbyPage() {
    return `
      <div class="page">
        <h1 class="title title-medium">Присоединиться</h1>
        
        <div class="form-group">
          <label class="form-label">Ваше имя</label>
          <input type="text" class="form-input" id="player-name" placeholder="Введите имя" maxlength="20">
        </div>
        
        <div class="form-group">
          <label class="form-label">Код лобби</label>
          <input type="text" class="form-input input-code" id="lobby-code" placeholder="GW1234" maxlength="6">
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-secondary" data-action="goto-home">Назад</button>
          <button class="btn btn-primary" data-action="join-lobby">Войти</button>
        </div>
      </div>
    `;
  },
  
  renderLobbyPage() {
    const lobby = AppState.lobby;
    const hasOpponent = lobby.opponent && lobby.opponent.id;
    
    return `
      <div class="page">
        <h1 class="title title-medium">Лобби</h1>
        
        <div class="lobby-code-box">
          <div class="lobby-code-label">Код для подключения</div>
          <div class="lobby-code">${lobby.lobbyCode}</div>
          <button class="copy-btn" data-action="copy-code" title="Копировать">📋</button>
        </div>
        
        <div class="card">
          <h3>Формат: ${lobby.tournamentFormat === 'bo5' ? 'Best of 5' : 'Best of 3'}</h3>
          <p>Нужно выбрать ${Utils.getRequiredFactions(lobby.tournamentFormat)} фракции</p>
        </div>
        
        <div class="players-section">
          <div class="section-title">Игроки</div>
          
          <div class="player-row">
            <div class="player-avatar">👑</div>
            <div class="player-name">${lobby.creator?.name || 'Создатель'}</div>
            <span class="player-status status-ready">Готов</span>
          </div>
          
          ${hasOpponent ? `
            <div class="player-row">
              <div class="player-avatar">⚔️</div>
              <div class="player-name">${lobby.opponent.name}</div>
              <span class="player-status status-ready">Готов</span>
            </div>
          ` : `
            <div class="waiting-box">
              <div class="spinner"></div>
              <p class="waiting-text">Ожидание второго игрока...</p>
            </div>
          `}
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-danger" data-action="leave-lobby">Выйти</button>
          ${AppState.isCreator && hasOpponent ? `
            <button class="btn btn-primary" data-action="start-game">Начать</button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  renderSelectFactionsPage() {
    const required = Utils.getRequiredFactions(AppState.tournamentFormat);
    const selected = AppState.localSelectedFactions;
    
    return `
      <div class="page">
        <div class="timer-section">
          <h2 class="title title-medium">Выбор фракций</h2>
          <div class="timer-display" id="timer">${Utils.formatTime(AppState.timerValue)}</div>
          <div class="selection-info">Выберите ${required} фракции</div>
          <div class="selection-counter">${selected.length} / ${required}</div>
        </div>
        
        <div class="opponent-status">
          <span class="opponent-status-text">Оппонент выбирает...</span>
          <div class="progress-dots" id="opponent-progress">
            ${Array(required).fill(0).map((_, i) => 
              `<div class="progress-dot ${i < AppState.opponentProgress ? 'filled' : ''}"></div>`
            ).join('')}
          </div>
        </div>
        
        ${AppState.selectionConfirmed ? `
          <div class="confirmed-box">✓ Выбор подтверждён. Ожидание оппонента...</div>
        ` : ''}
        
        <div class="faction-grid">
          ${FACTIONS.map(faction => `
            <div class="faction-card ${selected.includes(faction.id) ? 'selected' : ''} ${AppState.selectionConfirmed ? 'disabled' : ''}" 
                 data-faction="${faction.id}">
              <div class="faction-image" style="background-image: url('${faction.image}')"></div>
              <div class="faction-name-bar">
                <div class="faction-name">${faction.name}</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        ${!AppState.selectionConfirmed ? `
          <button class="btn btn-primary" data-action="confirm-selection" ${selected.length !== required ? 'disabled' : ''}>
            Подтвердить выбор
          </button>
        ` : ''}
      </div>
    `;
  },
  
  renderBanPhasePage() {
    const opponentFactions = AppState.isCreator 
      ? AppState.opponentSelectedFactions 
      : AppState.creatorSelectedFactions;
    
    return `
      <div class="page">
        <div class="timer-section">
          <h2 class="title title-medium">Фаза бана</h2>
          <div class="timer-display" id="timer">${Utils.formatTime(AppState.timerValue)}</div>
          <div class="selection-info">Забаньте одну фракцию оппонента</div>
        </div>
        
        ${AppState.banConfirmed ? `
          <div class="confirmed-box">✓ Бан подтверждён. Ожидание оппонента...</div>
        ` : ''}
        
        <div class="section-title">Фракции оппонента</div>
        <div class="faction-grid">
          ${opponentFactions.map(factionId => {
            const faction = FACTIONS.find(f => f.id === factionId);
            if (!faction) return '';
            return `
              <div class="faction-card ${AppState.localBannedFaction === factionId ? 'banned' : ''} ${AppState.banConfirmed ? 'disabled' : ''}" 
                   data-ban-faction="${factionId}">
                <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                <div class="faction-name-bar">
                  <div class="faction-name">${faction.name}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        ${!AppState.banConfirmed ? `
          <button class="btn btn-danger" data-action="confirm-ban" ${!AppState.localBannedFaction ? 'disabled' : ''}>
            Подтвердить бан
          </button>
        ` : ''}
      </div>
    `;
  },
  
  renderMatchResultsPage() {
    const lobby = AppState.lobby;
    const creatorFirst = Utils.coinFlip(lobby.lobbyCode);
    const coinImage = creatorFirst ? 'images/blue-coin.png' : 'images/red-coin.png';
    
    const creatorFactions = lobby.creatorSelectedFactions || [];
    const opponentFactions = lobby.opponentSelectedFactions || [];
    const creatorBan = lobby.opponentBannedFaction;
    const opponentBan = lobby.creatorBannedFaction;
    
    return `
      <div class="page">
        <div class="results-header">
          <h1 class="title title-medium">Результаты</h1>
        </div>
        
        <div class="vs-section">
          <div class="player-result-card">
            <div class="player-result-name">${lobby.creator?.name || 'Игрок 1'}</div>
            <div class="result-factions">
              ${creatorFactions.map(fid => {
                const f = FACTIONS.find(x => x.id === fid);
                const banned = fid === creatorBan;
                return `
                  <div class="result-faction-item ${banned ? 'banned' : ''}">
                    <div class="result-faction-icon" style="background-image: url('${f?.image}')"></div>
                    <span class="result-faction-name">${f?.name || fid}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          
          <div class="vs-badge">
            <div class="vs-text">VS</div>
            <div class="coin-display">
              <img src="${coinImage}" alt="coin" class="coin-image">
            </div>
            <div class="first-player-text">Первый ход</div>
            <div class="first-player-name">${creatorFirst ? lobby.creator?.name : lobby.opponent?.name}</div>
          </div>
          
          <div class="player-result-card">
            <div class="player-result-name">${lobby.opponent?.name || 'Игрок 2'}</div>
            <div class="result-factions">
              ${opponentFactions.map(fid => {
                const f = FACTIONS.find(x => x.id === fid);
                const banned = fid === opponentBan;
                return `
                  <div class="result-faction-item ${banned ? 'banned' : ''}">
                    <div class="result-faction-icon" style="background-image: url('${f?.image}')"></div>
                    <span class="result-faction-name">${f?.name || fid}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        <div class="action-buttons">
          ${AppState.isCreator ? `
            <button class="btn btn-secondary" data-action="reset-lobby">Новая игра</button>
          ` : ''}
          <button class="btn btn-primary" data-action="leave-lobby">Выйти</button>
        </div>
      </div>
    `;
  },
  
  updateTimer() {
    const el = document.getElementById('timer');
    if (el) {
      el.textContent = Utils.formatTime(AppState.timerValue);
      el.classList.toggle('warning', AppState.timerValue <= 10);
    }
  },
  
  updateOpponentProgress() {
    const container = document.getElementById('opponent-progress');
    if (container) {
      const required = Utils.getRequiredFactions(AppState.tournamentFormat);
      container.innerHTML = Array(required).fill(0).map((_, i) => 
        `<div class="progress-dot ${i < AppState.opponentProgress ? 'filled' : ''}"></div>`
      ).join('');
    }
  },
  
  updateConfirmationStatus() {
    this.renderPage(AppState.currentPage);
  },
  
  attachEventListeners() {
    // Action buttons
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleAction(action);
      });
    });
    
    // Faction selection
    document.querySelectorAll('[data-faction]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (AppState.selectionConfirmed) return;
        const factionId = e.currentTarget.dataset.faction;
        this.toggleFaction(factionId);
      });
    });
    
    // Ban selection
    document.querySelectorAll('[data-ban-faction]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (AppState.banConfirmed) return;
        const factionId = e.currentTarget.dataset.banFaction;
        this.selectBan(factionId);
      });
    });
    
    // Format cards
    document.querySelectorAll('.format-card').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        el.querySelector('input').checked = true;
      });
    });
  },
  
  handleAction(action) {
    switch(action) {
      case 'goto-home':
        this.renderPage('home');
        break;
      case 'goto-create':
        this.renderPage('create-lobby');
        break;
      case 'goto-join':
        this.renderPage('join-lobby');
        break;
      case 'create-lobby':
        const createName = document.getElementById('player-name')?.value.trim();
        const format = document.querySelector('input[name="format"]:checked')?.value || 'bo3';
        if (!createName) {
          Toast.error('Введите имя');
          return;
        }
        SocketManager.createLobby(createName, format);
        break;
      case 'join-lobby':
        const joinName = document.getElementById('player-name')?.value.trim();
        const code = document.getElementById('lobby-code')?.value.trim().toUpperCase();
        if (!joinName) {
          Toast.error('Введите имя');
          return;
        }
        if (!code || code.length < 4) {
          Toast.error('Введите код лобби');
          return;
        }
        SocketManager.joinLobby(joinName, code);
        break;
      case 'copy-code':
        navigator.clipboard.writeText(AppState.lobby.lobbyCode);
        Toast.success('Код скопирован!');
        break;
      case 'start-game':
        SocketManager.startGame();
        break;
      case 'confirm-selection':
        SocketManager.confirmSelection();
        break;
      case 'confirm-ban':
        SocketManager.confirmBan();
        break;
      case 'reset-lobby':
        SocketManager.resetLobby();
        break;
      case 'leave-lobby':
        SocketManager.leaveLobby();
        break;
    }
  },
  
  toggleFaction(factionId) {
    const required = Utils.getRequiredFactions(AppState.tournamentFormat);
    const index = AppState.localSelectedFactions.indexOf(factionId);
    
    if (index > -1) {
      AppState.localSelectedFactions.splice(index, 1);
    } else if (AppState.localSelectedFactions.length < required) {
      AppState.localSelectedFactions.push(factionId);
    } else {
      Toast.info(`Можно выбрать только ${required} фракции`);
      return;
    }
    
    this.renderPage('select-factions');
    SocketManager.saveSelectionProgress();
  },
  
  selectBan(factionId) {
    AppState.localBannedFaction = factionId;
    this.renderPage('ban-phase');
  }
};

// ===== Initialize =====
function initApp() {
  // Telegram WebApp
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    const user = tg.initDataUnsafe?.user;
    if (user) {
      AppState.player.id = 'tg_' + user.id;
      AppState.player.name = user.first_name || 'Игрок';
    }
  }
  
  SocketManager.connect();
  Renderer.renderPage('home');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
