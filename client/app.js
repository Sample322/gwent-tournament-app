// Инициализация Telegram WebApp и Socket.IO
const { WebApp } = window.Telegram;
let socket;

// Получаем базовый URL API
const API_BASE_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
  // Настройка Telegram Mini App
  WebApp.ready();
  WebApp.expand();

  // Инициализация Socket.IO
  socket = io(API_BASE_URL);
  
  // Обработчики событий Socket.IO
  setupSocketListeners();

  // Состояние приложения
  const appState = {
    currentPage: 'home',
    lobbyCode: null,
    isCreator: false,
    playerId: WebApp.initDataUnsafe.user ? WebApp.initDataUnsafe.user.id.toString() : Math.random().toString(36).substring(2, 9),
    playerName: WebApp.initDataUnsafe.user ? WebApp.initDataUnsafe.user.first_name : '',
    opponent: null,
    tournamentStage: 'quarter-finals',
    selectedFactions: [],
    bannedFaction: null,
    remainingFactions: [],
    opponentSelectedFactions: [],
    opponentRemainingFactions: [],
    currentRound: 1,
    maxRounds: 3,
    timerInterval: null,
    timerRemaining: 180, // 3 минуты в секундах
    status: 'waiting'
  };

  // Фракции Гвинта с картинками
  const gwentFactions = [
    { id: 'northern-realms', name: 'Северные Королевства', image: 'images/northern-realms.png' },
    { id: 'nilfgaard', name: 'Нильфгаард', image: 'images/nilfgaard.png' },
    { id: 'monsters', name: 'Чудовища', image: 'images/monsters.png' },
    { id: 'scoia-tael', name: 'Скоя\'таэли', image: 'images/scoia-tael.png' },
    { id: 'skellige', name: 'Скеллиге', image: 'images/skellige.png' }
  ];

  // Функция настройки обработчиков Socket.IO
  function setupSocketListeners() {
    socket.on('connect', () => {
      console.log('Подключение к серверу установлено');
    });

    socket.on('lobby-update', (lobby) => {
      console.log('Получено обновление лобби:', lobby);
      
      // Обновляем данные лобби
      appState.lobbyCode = lobby.lobbyCode;
      appState.tournamentStage = lobby.tournamentStage;
      
      // Определяем роль игрока и правильно устанавливаем данные оппонента
      if (lobby.creator && lobby.creator.id === appState.playerId) {
        appState.isCreator = true;
        appState.opponent = lobby.opponent;
      } else if (lobby.opponent && lobby.opponent.id === appState.playerId) {
        appState.isCreator = false;
        appState.opponent = lobby.creator;
      }
      
      // Обновляем данные о фракциях
      if (appState.isCreator) {
        appState.selectedFactions = lobby.creatorSelectedFactions || [];
        appState.bannedFaction = lobby.creatorBannedFaction;
        appState.remainingFactions = lobby.creatorRemainingFactions || [];
        appState.opponentSelectedFactions = lobby.opponentSelectedFactions || [];
        appState.opponentRemainingFactions = lobby.opponentRemainingFactions || [];
      } else {
        appState.selectedFactions = lobby.opponentSelectedFactions || [];
        appState.bannedFaction = lobby.opponentBannedFaction;
        appState.remainingFactions = lobby.opponentRemainingFactions || [];
        appState.opponentSelectedFactions = lobby.creatorSelectedFactions || [];
        appState.opponentRemainingFactions = lobby.creatorRemainingFactions || [];
      }
      
      // Обновление страницы в зависимости от статуса лобби
      if (lobby.status !== appState.status) {
        appState.status = lobby.status;
        
        switch (lobby.status) {
          case 'waiting':
            if (appState.currentPage !== 'lobby') {
              appState.currentPage = 'lobby';
              renderApp();
            } else {
              renderApp();
            }
            break;
          case 'selecting-factions':
            if (appState.currentPage !== 'select-factions') {
              appState.currentPage = 'select-factions';
              renderApp();
            } else {
              renderApp();
            }
            break;
          case 'banning':
            if (appState.currentPage !== 'ban-phase') {
              appState.currentPage = 'ban-phase';
              renderApp();
            } else {
              renderApp();
            }
            break;
          case 'match-results':
            if (appState.currentPage !== 'match-results') {
              appState.currentPage = 'match-results';
              renderApp();
            } else {
              renderApp();
            }
            break;
          default:
            renderApp();
        }
      } else {
        renderApp();
      }
    });
    
    // Новый игрок присоединился к лобби
    socket.on('player-joined', (data) => {
      console.log('Игрок присоединился:', data);
      if (data.playerId !== appState.playerId) {
        // Только обновляем UI, данные будут установлены через lobby-update
        renderApp();
      }
    });
    
    // Начало фазы выбора фракций
    socket.on('faction-selection-started', () => {
      appState.currentPage = 'select-factions';
      renderApp();
    });
    
    // Получение выбора фракций оппонента
    socket.on('opponent-factions-selected', (data) => {
      if (data.playerId !== appState.playerId) {
        appState.opponentSelectedFactions = data.selectedFactions;
        renderApp();
      }
    });
    
    // Получение бана фракции от оппонента
    socket.on('opponent-faction-banned', (data) => {
      if (data.playerId !== appState.playerId) {
        // Бан будет отображен через lobby-update
        console.log('Оппонент забанил фракцию:', data.bannedFaction);
      }
    });
    
    // Окончание фазы банов
    socket.on('ban-phase-ended', ({ timeExpired }) => {
      if (timeExpired) {
        alert('Время на бан истекло. Выбор сделан автоматически.');
      }
      appState.currentPage = 'match-results';
      renderApp();
    });
    
    // Истечение таймера бана
    socket.on('ban-timer-expired', () => {
      alert('Время на бан истекло. Выбор сделан автоматически.');
      if (appState.timerInterval) {
        clearInterval(appState.timerInterval);
        appState.timerInterval = null;
      }
    });
    
    // Обработка ошибки подключения
    socket.on('connect_error', (error) => {
      console.error('Ошибка подключения к серверу:', error);
      alert('Ошибка подключения к серверу. Пожалуйста, проверьте подключение к интернету.');
    });
  }

  // Функции для работы с API
  
  // Создание нового лобби
  async function createLobby() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/lobbies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creator: {
            id: appState.playerId,
            name: appState.playerName
          },
          tournamentStage: appState.tournamentStage
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Ошибка создания лобби');
      }
      
      const lobby = await response.json();
      appState.lobbyCode = lobby.lobbyCode;
      appState.isCreator = true;
      
      // Присоединяемся к лобби через Socket.IO
      socket.emit('join-lobby', {
        lobbyCode: appState.lobbyCode,
        playerId: appState.playerId,
        playerName: appState.playerName
      });
      
      appState.currentPage = 'lobby';
      renderApp();
    } catch (error) {
      console.error('Ошибка создания лобби:', error);
      alert(`Ошибка: ${error.message}`);
    }
  }
  
  // Присоединение к существующему лобби
  async function joinLobby(asSpectator = false) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/lobbies/${appState.lobbyCode}/join`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: appState.playerId,
          playerName: appState.playerName,
          isSpectator: asSpectator
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Ошибка присоединения к лобби');
      }
      
      const lobby = await response.json();
      
      // Правильная обработка данных лобби
      if (lobby.creator && lobby.creator.id === appState.playerId) {
        appState.isCreator = true;
        appState.opponent = lobby.opponent || null;
      } else if (lobby.opponent && lobby.opponent.id === appState.playerId) {
        appState.isCreator = false;
        appState.opponent = lobby.creator;
      }
      
      // Присоединяемся к комнате через Socket.IO
      socket.emit('join-lobby', {
        lobbyCode: appState.lobbyCode,
        playerId: appState.playerId,
        playerName: appState.playerName
      });
      
      appState.currentPage = 'lobby';
      renderApp();
    } catch (error) {
      console.error('Ошибка присоединения к лобби:', error);
      alert(`Ошибка: ${error.message}`);
    }
  }
  
  // Получение информации о лобби
  async function getLobbyInfo(lobbyCode) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/lobbies/${lobbyCode}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Лобби не найдено');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Ошибка получения информации о лобби:', error);
      alert(`Ошибка: ${error.message}`);
      return null;
    }
  }

  // Отправка выбранных фракций
  function confirmFactionSelection() {
    socket.emit('confirm-faction-selection', {
      lobbyCode: appState.lobbyCode,
      playerId: appState.playerId,
      selectedFactions: appState.selectedFactions
    });
  }
  
  // Отправка бана фракции
  function confirmFactionBan() {
    socket.emit('confirm-faction-ban', {
      lobbyCode: appState.lobbyCode,
      playerId: appState.playerId,
      bannedFaction: appState.bannedFaction
    });
  }
  
  // Запуск фазы выбора фракций
  function startFactionSelection() {
    socket.emit('start-faction-selection', {
      lobbyCode: appState.lobbyCode
    });
  }
  
  // Сброс лобби для новой игры
  function resetLobby() {
    socket.emit('reset-lobby', {
      lobbyCode: appState.lobbyCode
    });
  }

  // Функция рендеринга интерфейса
  function renderApp() {
    const appContainer = document.getElementById('app');
    
    switch (appState.currentPage) {
      case 'home':
        renderHomePage(appContainer);
        break;
      case 'create-lobby':
        renderCreateLobby(appContainer);
        break;
      case 'join-lobby':
        renderJoinLobby(appContainer);
        break;
      case 'lobby':
        renderLobby(appContainer);
        break;
      case 'select-factions':
        renderSelectFactions(appContainer);
        break;
      case 'ban-phase':
        renderBanPhase(appContainer);
        break;
      case 'match-results':
        renderMatchResults(appContainer);
        break;
      default:
        renderHomePage(appContainer);
    }
  }

  // Рендеринг домашней страницы
  function renderHomePage(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Турнир по Гвинту</h1>
          <div class="gwent-logo"></div>
        </div>
        
        <div class="gwent-content">
          <div class="player-form">
            <label for="player-name">Ваше имя:</label>
            <input type="text" id="player-name" placeholder="Введите имя игрока" value="${appState.playerName}">
          </div>
          
          <div class="gwent-buttons">
            <button id="create-lobby-btn" class="gwent-btn">Создать лобби</button>
            <button id="join-lobby-btn" class="gwent-btn">Присоединиться к лобби</button>
          </div>
        </div>
      </div>
    `;

    // Добавляем обработчики событий
    document.getElementById('player-name').addEventListener('input', (e) => {
      appState.playerName = e.target.value.trim();
    });

    document.getElementById('create-lobby-btn').addEventListener('click', () => {
      if (!appState.playerName) {
        alert('Пожалуйста, введите ваше имя');
        return;
      }
      appState.isCreator = true;
      appState.currentPage = 'create-lobby';
      renderApp();
    });

    document.getElementById('join-lobby-btn').addEventListener('click', () => {
      if (!appState.playerName) {
        alert('Пожалуйста, введите ваше имя');
        return;
      }
      appState.isCreator = false;
      appState.currentPage = 'join-lobby';
      renderApp();
    });

    // Инициализация проигрывания музыки
    initBackgroundMusic();
  }

  // Инициализация фоновой музыки
  function initBackgroundMusic() {
    // Создаем аудио-элемент, если его еще нет
    if (!document.getElementById('background-music')) {
      const music = document.createElement('audio');
      music.id = 'background-music';
      music.src = 'music/witcher-gwent-theme.mp3';
      music.loop = true;
      music.volume = 0.3;
      document.body.appendChild(music);
      
      // Создаем кнопку управления музыкой
      const musicButton = document.createElement('button');
      musicButton.classList.add('music-toggle');
      musicButton.innerHTML = '🔊';
      musicButton.title = 'Включить/выключить музыку';
      musicButton.id = 'music-toggle-btn';
      document.body.appendChild(musicButton);
      
      // Добавляем обработчик нажатия
      musicButton.addEventListener('click', toggleMusic);
    }
  }

  // Включение/выключение музыки
  function toggleMusic() {
    const music = document.getElementById('background-music');
    const musicBtn = document.getElementById('music-toggle-btn');
    
    if (music.paused) {
      music.play().catch(e => {
        console.log('Автоматическое воспроизведение отключено браузером:', e);
      });
      musicBtn.innerHTML = '🔊';
    } else {
      music.pause();
      musicBtn.innerHTML = '🔇';
    }
  }

  // Рендеринг страницы создания лобби
  function renderCreateLobby(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <button id="back-btn" class="gwent-back-btn">← Назад</button>
          <h1>Создание лобби</h1>
        </div>
        
        <div class="gwent-content">
          <div class="tournament-stage-selector">
            <h3>Выберите стадию турнира:</h3>
            <select id="tournament-stage">
              <option value="quarter-finals">Четвертьфинал</option>
              <option value="semi-finals">Полуфинал</option>
              <option value="finals">Финал</option>
            </select>
          </div>
          
          <button id="start-lobby-btn" class="gwent-btn">Создать и ожидать соперника</button>
        </div>
      </div>
    `;

    // Обработчики событий
    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      renderApp();
    });

    document.getElementById('tournament-stage').addEventListener('change', (e) => {
      appState.tournamentStage = e.target.value;
    });

    document.getElementById('start-lobby-btn').addEventListener('click', () => {
      createLobby();
    });
  }

  // Рендеринг страницы присоединения к лобби
  function renderJoinLobby(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <button id="back-btn" class="gwent-back-btn">← Назад</button>
          <h1>Присоединение к лобби</h1>
        </div>
        
        <div class="gwent-content">
          <div class="lobby-join-form">
            <label for="lobby-code">Введите код лобби:</label>
            <input type="text" id="lobby-code" placeholder="Например: GWENT123">
          </div>
          
          <div class="gwent-buttons">
            <button id="join-lobby-confirm-btn" class="gwent-btn">Присоединиться как игрок</button>
            <button id="join-lobby-spectator-btn" class="gwent-btn secondary">Присоединиться как зритель</button>
          </div>
        </div>
      </div>
    `;

    // Обработчики событий
    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      renderApp();
    });

    document.getElementById('join-lobby-confirm-btn').addEventListener('click', () => {
      const lobbyCode = document.getElementById('lobby-code').value.trim().toUpperCase();
      
      if (!lobbyCode) {
        alert('Пожалуйста, введите код лобби');
        return;
      }
      
      appState.lobbyCode = lobbyCode;
      joinLobby(false);
    });

    document.getElementById('join-lobby-spectator-btn').addEventListener('click', () => {
      const lobbyCode = document.getElementById('lobby-code').value.trim().toUpperCase();
      
      if (!lobbyCode) {
        alert('Пожалуйста, введите код лобби');
        return;
      }
      
      appState.lobbyCode = lobbyCode;
      joinLobby(true);
    });
  }

  // Рендеринг страницы лобби
  function renderLobby(container) {
    const waitingForOpponent = !appState.opponent;
    
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Лобби ${appState.lobbyCode}</h1>
        </div>
        
        <div class="gwent-content">
          ${waitingForOpponent ? `
            <div class="waiting-screen">
              <div class="loading-spinner"></div>
              <h2>Ожидание подключения противника...</h2>
              <p>Код вашего лобби: <strong>${appState.lobbyCode}</strong></p>
              <p>Поделитесь этим кодом с другим игроком, чтобы он мог присоединиться.</p>
            </div>
          ` : `
            <div class="lobby-players">
              <div class="player-card">
                <div class="player-avatar you"></div>
                <h3>${appState.isCreator ? appState.playerName : appState.opponent.name} ${appState.isCreator ? '(Вы)' : ''}</h3>
              </div>
              
              <div class="versus-indicator">VS</div>
              
              <div class="player-card">
                <div class="player-avatar opponent"></div>
                <h3>${appState.isCreator ? (appState.opponent ? appState.opponent.name : 'Ожидание...') : appState.playerName + ' (Вы)'}</h3>
              </div>
            </div>
            
            <div class="tournament-info">
              <h3>Стадия турнира: ${getTournamentStageName(appState.tournamentStage)}</h3>
              <p>Формат: Best of 3</p>
            </div>
            
            ${appState.isCreator ? `
              <button id="start-match-btn" class="gwent-btn" ${!appState.opponent ? 'disabled' : ''}>Начать матч</button>
            ` : `
              <div class="waiting-message">Ожидание начала матча создателем лобби...</div>
            `}
          `}
        </div>
      </div>
    `;
    
    // Если создатель и противник подключен, показываем кнопку начала матча
    if (appState.isCreator && appState.opponent) {
      document.getElementById('start-match-btn').addEventListener('click', () => {
        startFactionSelection();
      });
    }
  }

  // Получение названия стадии турнира
  function getTournamentStageName(stage) {
    const stages = {
      'quarter-finals': 'Четвертьфинал',
      'semi-finals': 'Полуфинал',
      'finals': 'Финал'
    };
    return stages[stage] || 'Неизвестная стадия';
  }

  // Рендеринг страницы выбора фракций
  function renderSelectFactions(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Выбор фракций</h1>
        </div>
        
        <div class="gwent-content">
          <div class="selection-instruction">
            <h3>Выберите 3 фракции</h3>
            <p>Выбрано: <span id="selection-count">${appState.selectedFactions.length}</span>/3</p>
          </div>
          
          <div class="factions-grid">
            ${gwentFactions.map(faction => `
              <div class="faction-card ${appState.selectedFactions.includes(faction.id) ? 'selected' : ''}" data-faction-id="${faction.id}">
                <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                <div class="faction-name">${faction.name}</div>
              </div>
            `).join('')}
          </div>
          
          <button id="confirm-selection-btn" class="gwent-btn" ${appState.selectedFactions.length === 3 ? '' : 'disabled'}>Подтвердить выбор</button>
        </div>
      </div>
    `;
    
    // Добавляем обработчики выбора фракций
    const factionCards = document.querySelectorAll('.faction-card');
    const confirmButton = document.getElementById('confirm-selection-btn');
    
    factionCards.forEach(card => {
      card.addEventListener('click', () => {
        const factionId = card.getAttribute('data-faction-id');
        
        if (card.classList.contains('selected')) {
          // Отменяем выбор
          card.classList.remove('selected');
          appState.selectedFactions = appState.selectedFactions.filter(id => id !== factionId);
        } else if (appState.selectedFactions.length < 3) {
          // Выбираем фракцию
          card.classList.add('selected');
          appState.selectedFactions.push(factionId);
        }
        
        // Обновляем счетчик и состояние кнопки
        document.getElementById('selection-count').textContent = appState.selectedFactions.length;
        confirmButton.disabled = appState.selectedFactions.length !== 3;
      });
    });
    
    confirmButton.addEventListener('click', () => {
      confirmFactionSelection();
    });
  }

  // Рендеринг страницы фазы банов
  function renderBanPhase(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Фаза банов</h1>
          <div class="ban-timer" id="ban-timer">03:00</div>
        </div>
        
        <div class="gwent-content">
          <div class="ban-instruction">
            <h3>Выберите 1 фракцию оппонента для бана</h3>
          </div>
          
          <div class="opponent-factions">
            <h4>Фракции оппонента:</h4>
            <div class="factions-grid ban-grid">
              ${getFactionsByIds(appState.opponentSelectedFactions).map(faction => `
                <div class="faction-card ${appState.bannedFaction === faction.id ? 'selected' : ''}" data-faction-id="${faction.id}">
                  <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                  <div class="faction-name">${faction.name}</div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <button id="confirm-ban-btn" class="gwent-btn" ${appState.bannedFaction ? '' : 'disabled'}>Подтвердить бан</button>
        </div>
      </div>
    `;
    
    // Запускаем отображение таймера
    startBanTimer();
    
    // Добавляем обработчики для выбора бана
    const factionCards = document.querySelectorAll('.faction-card');
    const confirmButton = document.getElementById('confirm-ban-btn');
    
    factionCards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation(); // Останавливаем всплытие события
        
        // Сначала снимаем выбор со всех карточек
        factionCards.forEach(c => c.classList.remove('selected'));
        
        // Выбираем текущую карточку
        card.classList.add('selected');
        appState.bannedFaction = card.getAttribute('data-faction-id');
        
        // Активируем кнопку подтверждения
        confirmButton.disabled = false;
      });
    });
    
    confirmButton.addEventListener('click', () => {
      confirmFactionBan();
    });
  }

  // Запуск таймера банов
  function startBanTimer() {
    appState.timerRemaining = 180; // 3 минуты
    updateTimerDisplay();
    
    if (appState.timerInterval) {
      clearInterval(appState.timerInterval);
    }
    
    appState.timerInterval = setInterval(() => {
      appState.timerRemaining--;
      updateTimerDisplay();
      
      if (appState.timerRemaining <= 0) {
        clearInterval(appState.timerInterval);
        appState.timerInterval = null;
      }
    }, 1000);
  }

  // Обновление отображения таймера
  function updateTimerDisplay() {
    const minutes = Math.floor(appState.timerRemaining / 60);
    const seconds = appState.timerRemaining % 60;
    const timerDisplay = document.getElementById('ban-timer');
    if (timerDisplay) {
      timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      // Добавляем визуальное предупреждение при малом количестве времени
      if (appState.timerRemaining <= 30) {
        timerDisplay.classList.add('warning');
      }
    }
  }

  // Получение информации о фракциях по их ID
  function getFactionsByIds(ids) {
    return ids.map(id => gwentFactions.find(faction => faction.id === id) || 
      { id: id, name: "Неизвестная фракция", image: "images/gwent-logo.png" });
  }

  // Рендеринг страницы результатов матча
  function renderMatchResults(container) {
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Результаты выбора</h1>
        </div>
        
        <div class="gwent-content">
          <div class="match-info">
            <div class="player-results">
              <h3>Ваши доступные фракции:</h3>
              <div class="factions-grid results-grid">
                ${getFactionsByIds(appState.remainingFactions).map(faction => `
                  <div class="faction-card">
                    <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                    <div class="faction-name">${faction.name}</div>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="opponent-results">
              <h3>Доступные фракции оппонента:</h3>
              <div class="factions-grid results-grid">
                ${getFactionsByIds(appState.opponentRemainingFactions).map(faction => `
                  <div class="faction-card">
                    <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                    <div class="faction-name">${faction.name}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          
          <div class="match-controls">
            <button id="new-match-btn" class="gwent-btn">Начать новый матч</button>
            <button id="return-home-btn" class="gwent-btn secondary">Вернуться в меню</button>
          </div>
        </div>
      </div>
    `;
    
    // Остановка таймера, если он всё еще активен
    if (appState.timerInterval) {
      clearInterval(appState.timerInterval);
      appState.timerInterval = null;
    }
    
    document.getElementById('new-match-btn').addEventListener('click', () => {
      resetLobby();
    });
    
    document.getElementById('return-home-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      renderApp();
    });
  }

  // Начальный рендеринг приложения
  renderApp();

  // Экспорт функций и состояния в глобальную область для отладки
  window.appState = appState;
  window.renderApp = renderApp;
  window.socket = socket;
});