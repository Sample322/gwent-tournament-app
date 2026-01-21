// ===== GWENT Tournament App =====

// Faction data
const FACTIONS = [
  { id: 'monsters', name: 'Монстры', icon: '👹' },
  { id: 'nilfgaard', name: 'Нильфгаард', icon: '☀️' },
  { id: 'northern', name: 'Северные Королевства', icon: '🦁' },
  { id: 'scoiatael', name: "Скоя'таэли", icon: '🏹' },
  { id: 'skellige', name: 'Скеллиге', icon: '⚓' },
  { id: 'syndicate', name: 'Синдикат', icon: '💰' }
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
  
  // Local selection state (never overwritten by server)
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
    // Deterministic based on lobby code
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
  container: null,
  
  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },
  
  show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  success(message) { this.show(message, 'success'); },
  error(message) { this.show(message, 'error'); },
  info(message) { this.show(message, 'info'); }
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
      // Rejoin lobby if we have one
      if (AppState.lobby?.lobbyCode) {
        socket.emit('join-lobby', {
          lobbyCode: AppState.lobby.lobbyCode,
          playerId: AppState.player.id,
          playerName: AppState.player.name
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      Toast.error('Соединение потеряно. Переподключение...');
    });
    
    socket.on('player-joined', (data) => {
      Toast.success(`${data.playerName} присоединился!`);
    });
    
    socket.on('lobby-update', (lobby) => {
      this.handleLobbyUpdate(lobby);
    });
    
    socket.on('error', (data) => {
      Toast.error(data.message || 'Произошла ошибка');
    });
    
    socket.on('faction-selection-started', (data) => {
      AppState.timerValue = 300; // 5 minutes
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
        Renderer.updateOpponentStatus();
      }
    });
    
    socket.on('phase-changed', (data) => {
      if (data.phase === 'banning') {
        this.stopTimer();
        AppState.timerValue = 180; // 3 minutes
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
    
    socket.on('ban-phase-ended', (data) => {
      this.stopTimer();
      Renderer.renderPage('match-results');
    });
    
    socket.on('lobby-reset', (data) => {
      AppState.localSelectedFactions = [];
      AppState.localBannedFaction = null;
      AppState.selectionConfirmed = false;
      AppState.banConfirmed = false;
      AppState.opponentConfirmed = false;
      Renderer.renderPage('lobby');
      Toast.info('Лобби сброшено для новой игры');
    });
    
    socket.on('selection-timer-expired', () => {
      Toast.info('Время на выбор истекло');
    });
    
    socket.on('ban-timer-expired', () => {
      Toast.info('Время на бан истекло');
    });
    
    socket.on('player-disconnected', (data) => {
      Toast.error('Оппонент отключился');
    });
    
    socket.on('player-reconnected', (data) => {
      Toast.success('Оппонент переподключился');
    });
    
    socket.on('reconnect-success', (data) => {
      AppState.lobby = data.lobby;
      if (data.playerState) {
        AppState.localSelectedFactions = data.playerState.selections || [];
        AppState.localBannedFaction = data.playerState.bannedFaction;
        AppState.selectionConfirmed = data.playerState.selectionConfirmed;
        AppState.banConfirmed = data.playerState.banConfirmed;
      }
      Toast.success('Переподключение успешно');
    });
  },
  
  handleLobbyUpdate(lobby) {
    AppState.lobby = lobby;
    
    // Update tournament format
    AppState.tournamentFormat = lobby.tournamentFormat || 'bo3';
    
    // Update factions from server
    AppState.creatorSelectedFactions = lobby.creatorSelectedFactions || [];
    AppState.opponentSelectedFactions = lobby.opponentSelectedFactions || [];
    AppState.creatorBannedFaction = lobby.creatorBannedFaction;
    AppState.opponentBannedFaction = lobby.opponentBannedFaction;
    
    // Re-render current page
    if (AppState.currentPage === 'lobby') {
      Renderer.renderPage('lobby');
    } else if (AppState.currentPage === 'match-results') {
      Renderer.renderPage('match-results');
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
      // Auto-select remaining factions
      const required = Utils.getRequiredFactions(AppState.tournamentFormat);
      while (AppState.localSelectedFactions.length < required) {
        const available = FACTIONS.filter(f => !AppState.localSelectedFactions.includes(f.id));
        if (available.length > 0) {
          AppState.localSelectedFactions.push(available[0].id);
        } else break;
      }
      this.confirmSelection();
    } else if (AppState.currentPage === 'ban-phase' && !AppState.banConfirmed) {
      // Auto-ban first available
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
        Toast.error(error.message || 'Ошибка создания лобби');
        return;
      }
      
      const lobby = await response.json();
      AppState.lobby = lobby;
      AppState.isCreator = true;
      
      // Join socket room
      AppState.socket.emit('join-lobby', {
        lobbyCode: lobby.lobbyCode,
        playerId: AppState.player.id,
        playerName: AppState.player.name
      });
      
      Renderer.renderPage('lobby');
      Toast.success('Лобби создано!');
    } catch (error) {
      console.error('Error creating lobby:', error);
      Toast.error('Ошибка сети при создании лобби');
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
        Toast.error(error.message || 'Ошибка присоединения к лобби');
        return;
      }
      
      const lobby = await response.json();
      AppState.lobby = lobby;
      AppState.isCreator = lobby.creator?.id === AppState.player.id;
      AppState.tournamentFormat = lobby.tournamentFormat;
      
      // Join socket room
      AppState.socket.emit('join-lobby', {
        lobbyCode: lobby.lobbyCode,
        playerId: AppState.player.id,
        playerName: AppState.player.name
      });
      
      Renderer.renderPage('lobby');
      Toast.success('Присоединились к лобби!');
    } catch (error) {
      console.error('Error joining lobby:', error);
      Toast.error('Ошибка сети при присоединении к лобби');
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
    if (AppState.lobby?.lobbyCode) {
      AppState.socket.emit('leave-lobby', {
        lobbyCode: AppState.lobby.lobbyCode,
        playerId: AppState.player.id
      });
    }
    AppState.lobby = null;
    Renderer.renderPage('home');
  }
};

// ===== Renderer =====
const Renderer = {
  renderPage(page) {
    AppState.currentPage = page;
    const app = document.getElementById('app');
    
    switch(page) {
      case 'home':
        app.innerHTML = this.renderHomePage();
        break;
      case 'create-lobby':
        app.innerHTML = this.renderCreateLobbyPage();
        break;
      case 'join-lobby':
        app.innerHTML = this.renderJoinLobbyPage();
        break;
      case 'lobby':
        app.innerHTML = this.renderLobbyPage();
        break;
      case 'select-factions':
        app.innerHTML = this.renderSelectFactionsPage();
        break;
      case 'ban-phase':
        app.innerHTML = this.renderBanPhasePage();
        break;
      case 'match-results':
        app.innerHTML = this.renderMatchResultsPage();
        break;
    }
    
    this.attachEventListeners();
  },
  
  renderHomePage() {
    return `
      <div class="page home-page">
        <h1>GWENT</h1>
        <p>Турнирный помощник</p>
        <div class="home-buttons">
          <button class="btn btn-primary btn-full" data-action="goto-create">
            Создать лобби
          </button>
          <button class="btn btn-secondary btn-full" data-action="goto-join">
            Присоединиться
          </button>
        </div>
      </div>
    `;
  },
  
  renderCreateLobbyPage() {
    return `
      <div class="page">
        <h1>Создать лобби</h1>
        
        <div class="form-group">
          <label class="form-label">Ваше имя</label>
          <input type="text" class="form-input" id="player-name" placeholder="Введите имя" maxlength="20">
        </div>
        
        <div class="form-group">
          <label class="form-label">Формат турнира</label>
          <div class="format-options">
            <label class="format-option selected">
              <input type="radio" name="format" value="bo3" checked>
              <div class="format-name">Bo3</div>
              <div class="format-desc">3 фракции</div>
            </label>
            <label class="format-option">
              <input type="radio" name="format" value="bo5">
              <div class="format-name">Bo5</div>
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
        <h1>Присоединиться</h1>
        
        <div class="form-group">
          <label class="form-label">Ваше имя</label>
          <input type="text" class="form-input" id="player-name" placeholder="Введите имя" maxlength="20">
        </div>
        
        <div class="form-group">
          <label class="form-label">Код лобби</label>
          <input type="text" class="form-input" id="lobby-code" placeholder="GW1234" maxlength="6" style="text-transform: uppercase; letter-spacing: 0.3em; text-align: center; font-size: 1.5rem;">
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
      <div class="page lobby-page">
        <h1>Лобби</h1>
        
        <div class="lobby-code-display">
          <div class="form-label">Код для подключения</div>
          <div class="lobby-code">${lobby.lobbyCode}</div>
          <button class="copy-btn" data-action="copy-code" title="Копировать">📋</button>
        </div>
        
        <div class="card">
          <h3>Формат: ${lobby.tournamentFormat === 'bo5' ? 'Best of 5' : 'Best of 3'}</h3>
          <p>Нужно выбрать ${Utils.getRequiredFactions(lobby.tournamentFormat)} фракции</p>
        </div>
        
        <div class="players-list">
          <h3>Игроки</h3>
          
          <div class="player-item">
            <div class="player-avatar">👤</div>
            <div class="player-name">${lobby.creator?.name || 'Создатель'}</div>
            <span class="player-status status-ready">Готов</span>
          </div>
          
          ${hasOpponent ? `
            <div class="player-item">
              <div class="player-avatar">👤</div>
              <div class="player-name">${lobby.opponent.name}</div>
              <span class="player-status status-ready">Готов</span>
            </div>
          ` : `
            <div class="waiting-opponent">
              <div class="spinner"></div>
              <p>Ожидание второго игрока...</p>
            </div>
          `}
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-danger" data-action="leave-lobby">Выйти</button>
          ${AppState.isCreator && hasOpponent ? `
            <button class="btn btn-primary" data-action="start-game">Начать игру</button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  renderSelectFactionsPage() {
    const required = Utils.getRequiredFactions(AppState.tournamentFormat);
    const selected = AppState.localSelectedFactions;
    
    return `
      <div class="page selection-page">
        <div class="selection-header">
          <h2>Выберите фракции</h2>
          <div class="timer" id="timer">${Utils.formatTime(AppState.timerValue)}</div>
          <div class="selection-info">Выберите ${required} фракции</div>
          <div class="selection-counter">${selected.length} / ${required}</div>
        </div>
        
        <div class="opponent-status">
          <span>Оппонент выбирает...</span>
          <div class="opponent-progress" id="opponent-progress">
            ${Array(required).fill(0).map((_, i) => 
              `<div class="progress-dot ${i < AppState.opponentProgress ? 'filled' : ''}"></div>`
            ).join('')}
          </div>
        </div>
        
        ${AppState.selectionConfirmed ? `
          <div class="confirmation-status">
            ✓ Выбор подтверждён. Ожидание оппонента...
          </div>
        ` : ''}
        
        <div class="faction-grid">
          ${FACTIONS.map(faction => `
            <div class="faction-card ${selected.includes(faction.id) ? 'selected' : ''} ${AppState.selectionConfirmed ? 'disabled' : ''}" 
                 data-faction="${faction.id}">
              <div class="faction-icon">${faction.icon}</div>
              <div class="faction-name">${faction.name}</div>
            </div>
          `).join('')}
        </div>
        
        ${!AppState.selectionConfirmed ? `
          <button class="btn btn-primary btn-full" data-action="confirm-selection" 
                  ${selected.length !== required ? 'disabled' : ''}>
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
      <div class="page selection-page">
        <div class="selection-header">
          <h2>Фаза бана</h2>
          <div class="timer" id="timer">${Utils.formatTime(AppState.timerValue)}</div>
          <div class="selection-info">Забаньте одну фракцию оппонента</div>
        </div>
        
        ${AppState.banConfirmed ? `
          <div class="confirmation-status">
            ✓ Бан подтверждён. Ожидание оппонента...
          </div>
        ` : ''}
        
        <h3 style="margin-bottom: 1rem;">Фракции оппонента:</h3>
        <div class="faction-grid">
          ${opponentFactions.map(factionId => {
            const faction = FACTIONS.find(f => f.id === factionId);
            if (!faction) return '';
            return `
              <div class="faction-card ${AppState.localBannedFaction === factionId ? 'banned' : ''} ${AppState.banConfirmed ? 'disabled' : ''}" 
                   data-ban-faction="${factionId}">
                <div class="faction-icon">${faction.icon}</div>
                <div class="faction-name">${faction.name}</div>
              </div>
            `;
          }).join('')}
        </div>
        
        ${!AppState.banConfirmed ? `
          <button class="btn btn-danger btn-full" data-action="confirm-ban" 
                  ${!AppState.localBannedFaction ? 'disabled' : ''}>
            Подтвердить бан
          </button>
        ` : ''}
      </div>
    `;
  },
  
  renderMatchResultsPage() {
    const lobby = AppState.lobby;
    const creatorFirst = Utils.coinFlip(lobby.lobbyCode);
    
    const creatorFactions = lobby.creatorSelectedFactions || [];
    const opponentFactions = lobby.opponentSelectedFactions || [];
    const creatorBan = lobby.opponentBannedFaction;
    const opponentBan = lobby.creatorBannedFaction;
    
    return `
      <div class="page results-page">
        <h1>Результаты</h1>
        
        <div class="results-container">
          <div class="player-results">
            <h3>${lobby.creator?.name || 'Игрок 1'}</h3>
            <div class="results-factions">
              ${creatorFactions.map(factionId => {
                const faction = FACTIONS.find(f => f.id === factionId);
                const isBanned = factionId === creatorBan;
                return `
                  <div class="result-faction ${isBanned ? 'banned' : ''}">
                    <span class="faction-icon">${faction?.icon || '?'}</span>
                    <span>${faction?.name || factionId}</span>
                    ${isBanned ? '<span style="margin-left: auto; color: var(--accent-red);">ЗАБАНЕНО</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          
          <div class="vs-divider">
            <div class="vs-text">VS</div>
            <div class="coin-result">
              <div class="coin-icon">${creatorFirst ? '👑' : '🎲'}</div>
              <div class="coin-label">Первый ход</div>
            </div>
            <div style="font-size: 0.9rem; color: var(--text-secondary);">
              ${creatorFirst ? lobby.creator?.name : lobby.opponent?.name}
            </div>
          </div>
          
          <div class="player-results">
            <h3>${lobby.opponent?.name || 'Игрок 2'}</h3>
            <div class="results-factions">
              ${opponentFactions.map(factionId => {
                const faction = FACTIONS.find(f => f.id === factionId);
                const isBanned = factionId === opponentBan;
                return `
                  <div class="result-faction ${isBanned ? 'banned' : ''}">
                    <span class="faction-icon">${faction?.icon || '?'}</span>
                    <span>${faction?.name || factionId}</span>
                    ${isBanned ? '<span style="margin-left: auto; color: var(--accent-red);">ЗАБАНЕНО</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        <div class="action-buttons" style="margin-top: 2rem;">
          ${AppState.isCreator ? `
            <button class="btn btn-secondary" data-action="reset-lobby">Новая игра</button>
          ` : ''}
          <button class="btn btn-primary" data-action="leave-lobby">Выйти</button>
        </div>
      </div>
    `;
  },
  
  updateTimer() {
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = Utils.formatTime(AppState.timerValue);
      if (AppState.timerValue <= 10) {
        timerEl.classList.add('warning');
      }
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
    // Re-render current page to show confirmation
    this.renderPage(AppState.currentPage);
  },
  
  updateOpponentStatus() {
    // Could add visual indicator that opponent confirmed
    if (AppState.opponentConfirmed) {
      Toast.info('Оппонент подтвердил выбор');
    }
  },
  
  attachEventListeners() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleAction(action);
      });
    });
    
    document.querySelectorAll('[data-faction]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (AppState.selectionConfirmed) return;
        const factionId = e.currentTarget.dataset.faction;
        this.toggleFaction(factionId);
      });
    });
    
    document.querySelectorAll('[data-ban-faction]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (AppState.banConfirmed) return;
        const factionId = e.currentTarget.dataset.banFaction;
        this.selectBan(factionId);
      });
    });
    
    // Format option selection
    document.querySelectorAll('.format-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.format-option').forEach(opt => opt.classList.remove('selected'));
        el.classList.add('selected');
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
          Toast.error('Введите ваше имя');
          return;
        }
        SocketManager.createLobby(createName, format);
        break;
      case 'join-lobby':
        const joinName = document.getElementById('player-name')?.value.trim();
        const code = document.getElementById('lobby-code')?.value.trim().toUpperCase();
        if (!joinName) {
          Toast.error('Введите ваше имя');
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
    
    // Update UI
    this.renderPage('select-factions');
    
    // Send progress to server
    SocketManager.saveSelectionProgress();
  },
  
  selectBan(factionId) {
    AppState.localBannedFaction = factionId;
    this.renderPage('ban-phase');
  }
};

// ===== Initialize App =====
function initApp() {
  // Check for Telegram WebApp
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
  
  // Initialize components
  Toast.init();
  SocketManager.connect();
  Renderer.renderPage('home');
  
  // Add background effects
  const bgEffects = document.createElement('div');
  bgEffects.className = 'background-effects';
  bgEffects.innerHTML = `
    <div class="bg-gradient"></div>
    <div class="bg-particles">
      ${Array(10).fill(0).map(() => '<div class="particle"></div>').join('')}
    </div>
  `;
  document.body.prepend(bgEffects);
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
