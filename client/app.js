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
    tournamentFormat: 'bo3', // 'bo3' или 'bo5'
    selectedFactions: [],
    bannedFaction: null,
    remainingFactions: [],
    opponentSelectedFactions: [],
    opponentRemainingFactions: [],
    currentRound: 1,
    maxRounds: 3, // Будет обновляться в зависимости от формата
    timerInterval: null,
    timerRemaining: 180, // 3 минуты в секундах
    status: 'waiting',
    opponentSelectionStatus: { status: null, phase: null },
    selectionConfirmed: false, // Добавляем флаг подтверждения выбора
    factionSelectionsLocked: false, // Блокировка выбора, когда оппонент подтвердил выбор
    currentLobby: null, // Для оптимизации обновлений
    throttleTimer: null // Для оптимизации рендеринга
  };

  // Обновление фракций - добавляем Синдикат
  const gwentFactions = [
    { id: 'northern-realms', name: 'Северные Королевства', image: 'images/northern-realms.png' },
    { id: 'nilfgaard', name: 'Нильфгаард', image: 'images/nilfgaard.png' },
    { id: 'monsters', name: 'Чудовища', image: 'images/monsters.png' },
    { id: 'scoia-tael', name: 'Скоя\'таэли', image: 'images/scoia-tael.png' },
    { id: 'skellige', name: 'Скеллиге', image: 'images/skellige.png' },
    { id: 'syndicate', name: 'Синдикат', image: 'images/syndicate.png' }
  ];

  // Конфигурация для разных форматов
  const formatConfig = {
    'bo3': { selectCount: 3, banCount: 1, maxRounds: 3 },
    'bo5': { selectCount: 4, banCount: 1, maxRounds: 5 }
  };

  // Функция настройки обработчиков Socket.IO
  function setupSocketListeners() {
    socket.on('connect', () => {
      console.log('Подключение к серверу установлено');
    });

    socket.on('lobby-update', (lobby) => {
      console.log('Получено обновление лобби:', lobby);
      
      // Обновляем только если данные действительно изменились
      if (JSON.stringify(lobby) !== JSON.stringify(appState.currentLobby)) {
        appState.currentLobby = lobby;
        
        // Обновляем данные лобби
        appState.lobbyCode = lobby.lobbyCode;
        appState.tournamentFormat = lobby.tournamentFormat || 'bo3';
        appState.maxRounds = formatConfig[appState.tournamentFormat].maxRounds;
        
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
                throttledRenderApp();
              } else {
                throttledRenderApp();
              }
              break;
            case 'selecting-factions':
              if (appState.currentPage !== 'select-factions') {
                appState.currentPage = 'select-factions';
                // Сбрасываем флаг подтверждения при начале новой фазы
                appState.selectionConfirmed = false;
                throttledRenderApp();
              } else {
                throttledRenderApp();
              }
              break;
            case 'banning':
              if (appState.currentPage !== 'ban-phase') {
                appState.currentPage = 'ban-phase';
                // Сбрасываем флаги и состояние бана
                appState.selectionConfirmed = false;
                appState.bannedFaction = null; // Сбрасываем выбранную фракцию для бана
                throttledRenderApp();
              } else {
                throttledRenderApp();
              }
              break;
            case 'match-results':
              if (appState.currentPage !== 'match-results') {
                appState.currentPage = 'match-results';
                throttledRenderApp();
              } else {
                throttledRenderApp();
              }
              break;
            default:
              throttledRenderApp();
          }
        } else {
          throttledRenderApp();
        }
        
        // Проверяем, нужно ли скрыть индикатор ожидания
        if (appState.currentPage === 'selecting-factions' && 
            appState.opponentSelectedFactions && 
            appState.opponentSelectedFactions.length === formatConfig[appState.tournamentFormat].selectCount) {
          hideWaitingMessage();
        }
        
        if (appState.currentPage === 'ban-phase' && 
            appState.selectedFactions.length === formatConfig[appState.tournamentFormat].selectCount && 
            appState.opponentSelectedFactions.length === formatConfig[appState.tournamentFormat].selectCount) {
          hideWaitingMessage();
        }
      }
    });
    
    // Новый игрок присоединился к лобби
    socket.on('player-joined', (data) => {
      console.log('Игрок присоединился:', data);
      if (data.playerId !== appState.playerId) {
        // Только обновляем UI, данные будут установлены через lobby-update
        throttledRenderApp();
      }
    });
    
    // Начало фазы выбора фракций
    socket.on('faction-selection-started', () => {
      appState.currentPage = 'select-factions';
      // Сбрасываем флаг подтверждения при начале новой фазы
      appState.selectionConfirmed = false;
      appState.factionSelectionsLocked = false;
      throttledRenderApp();
    });
    
    // Получение выбора фракций оппонента
    socket.on('opponent-factions-selected', (data) => {
      if (data.playerId !== appState.playerId) {
        appState.opponentSelectedFactions = data.selectedFactions;
        // Убираем блокировку выбора при получении выбора оппонента
        // appState.factionSelectionsLocked = true; - удаляем эту строку
        throttledRenderApp();
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
      throttledRenderApp();
    });
    
    // Истечение таймера бана
    socket.on('ban-timer-expired', () => {
      alert('Время на бан истекло. Выбор сделан автоматически.');
      if (appState.timerInterval) {
        clearInterval(appState.timerInterval);
        appState.timerInterval = null;
      }
    });
    
    // Статус выбора игрока
    socket.on('player-selection-status', ({ playerId, status, phase }) => {
      if (playerId !== appState.playerId) {
        appState.opponentSelectionStatus = { status, phase };
        
        // Если оппонент завершил свой выбор и мы на той же фазе
        if (status === 'completed' && phase === appState.currentPage) {
          // Разблокируем выбор фракций, если мы еще не подтвердили свой выбор
          if (!appState.selectionConfirmed) {
            appState.factionSelectionsLocked = false;
          }
          
          // Если оппонент завершил свой выбор и мы завершили свой, скрыть сообщение ожидания
          if (appState.selectionConfirmed) {
            hideWaitingMessage();
          }
        }
        
        throttledRenderApp();
      }
    });
    
    // Обработка ошибки подключения
    socket.on('connect_error', (error) => {
      console.error('Ошибка подключения к серверу:', error);
      alert('Ошибка подключения к серверу. Пожалуйста, проверьте подключение к интернету.');
    });
  }

  // Оптимизированная функция рендеринга
  function throttledRenderApp() {
    if (appState.throttleTimer) return;
    
    appState.throttleTimer = setTimeout(() => {
      renderApp();
      appState.throttleTimer = null;
    }, 50); // Минимальный интервал между обновлениями 50 мс
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
          tournamentFormat: appState.tournamentFormat // Добавляем формат турнира
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
      throttledRenderApp();
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
      throttledRenderApp();
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
    // Устанавливаем флаг подтверждения
    appState.selectionConfirmed = true;
    
    // Показываем диалог подтверждения
    showConfirmDialog(
      'Подтвердить выбор фракций?', 
      'Вы выбрали: ' + getFactionsByIds(appState.selectedFactions).map(f => f.name).join(', '),
      () => {
        // Отправляем выбор на сервер
        socket.emit('confirm-faction-selection', {
          lobbyCode: appState.lobbyCode,
          playerId: appState.playerId,
          selectedFactions: appState.selectedFactions
        });
        
        // Отправляем статус
        socket.emit('player-selection-status', {
          lobbyCode: appState.lobbyCode,
          playerId: appState.playerId,
          status: 'completed',
          phase: 'selecting-factions'
        });
        
        // Скрываем диалог
        hideDialog();
        
        // Показываем сообщение о ожидании
        showWaitingMessage('Ожидание выбора оппонента...');
      },
      () => {
        // При отмене сбрасываем флаг подтверждения
        appState.selectionConfirmed = false;
        hideDialog();
      }
    );
  }
  
  // Отправка бана фракции
  function confirmFactionBan() {
    // Устанавливаем флаг подтверждения
    appState.selectionConfirmed = true;
    
    // Показываем диалог подтверждения
    const bannedFaction = getFactionsByIds([appState.bannedFaction])[0];
    showConfirmDialog(
      'Подтвердить бан фракции?', 
      `Вы выбрали для бана: ${bannedFaction.name}`,
      () => {
        // Отправляем бан на сервер
        socket.emit('confirm-faction-ban', {
          lobbyCode: appState.lobbyCode,
          playerId: appState.playerId,
          bannedFaction: appState.bannedFaction
        });
        
        // Отправляем статус
        socket.emit('player-selection-status', {
          lobbyCode: appState.lobbyCode,
          playerId: appState.playerId,
          status: 'completed',
          phase: 'ban-phase'
        });
        
        // Скрываем диалог
        hideDialog();
        
        // Показываем сообщение о ожидании
        showWaitingMessage('Ожидание бана от оппонента...');
      },
      () => {
        // При отмене сбрасываем флаг подтверждения
        appState.selectionConfirmed = false;
        hideDialog();
      }
    );
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
      throttledRenderApp();
    });

    document.getElementById('join-lobby-btn').addEventListener('click', () => {
      if (!appState.playerName) {
        alert('Пожалуйста, введите ваше имя');
        return;
      }
      appState.isCreator = false;
      appState.currentPage = 'join-lobby';
      throttledRenderApp();
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
          <div class="format-selector">
            <h3>Выберите формат:</h3>
            <select id="tournament-format">
              <option value="bo3">Best of 3 (выбор 3 колод)</option>
              <option value="bo5">Best of 5 (выбор 4 колод)</option>
            </select>
          </div>
          
          <button id="start-lobby-btn" class="gwent-btn">Создать и ожидать соперника</button>
        </div>
      </div>
    `;

    // Обработчики событий
    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      throttledRenderApp();
    });

    document.getElementById('tournament-format').addEventListener('change', (e) => {
      appState.tournamentFormat = e.target.value;
      appState.maxRounds = formatConfig[appState.tournamentFormat].maxRounds;
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
            <button id="join-lobby-confirm-btn" class="gwent-btn">Присоединиться к игре</button>
            <!-- Удалена кнопка для зрителей -->
          </div>
        </div>
      </div>
    `;

    // Обработчики событий
    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      throttledRenderApp();
    });

    document.getElementById('join-lobby-confirm-btn').addEventListener('click', () => {
      const lobbyCode = document.getElementById('lobby-code').value.trim().toUpperCase();
      
      if (!lobbyCode) {
        alert('Пожалуйста, введите код лобби');
        return;
      }
      
      appState.lobbyCode = lobbyCode;
      joinLobby(false); // Всегда присоединяемся как игрок
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
              <p>Формат: ${appState.tournamentFormat === 'bo3' ? 'Best of 3' : 'Best of 5'}</p>
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

  // Рендеринг страницы выбора фракций
  function renderSelectFactions(container) {
    const selectCount = formatConfig[appState.tournamentFormat].selectCount;
    
    container.innerHTML = `
      <div class="gwent-app select-factions">
        <div class="gwent-header">
          <h1>Выбор фракций</h1>
        </div>
        
        <div class="gwent-content">
          <div class="selection-instruction">
            <h3>Выберите ${selectCount} фракции</h3>
            <p>Выбрано: <span id="selection-count">${appState.selectedFactions.length}</span>/${selectCount}</p>
          </div>
          
          <div class="factions-grid">
            ${gwentFactions.map(faction => `
              <div class="faction-card ${appState.selectedFactions.includes(faction.id) ? 'selected' : ''}" 
                   data-faction-id="${faction.id}"
                   ${appState.selectionConfirmed ? 'disabled' : ''}>
                <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                <div class="faction-name">${faction.name}</div>
              </div>
            `).join('')}
          </div>
          
          <button id="confirm-selection-btn" class="gwent-btn" ${appState.selectedFactions.length === selectCount ? '' : 'disabled'}>Подтвердить выбор</button>
        </div>
      </div>
    `;
    
    // Добавляем обработчики выбора фракций
    const factionCards = document.querySelectorAll('.faction-card');
    const confirmButton = document.getElementById('confirm-selection-btn');
    
    factionCards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Останавливаем всплытие события
        e.stopPropagation();
        
        // Если подтверждение уже отправлено или карточка отключена, ничего не делаем
        if (appState.selectionConfirmed || card.hasAttribute('disabled')) {
          return;
        }
        
        const factionId = card.getAttribute('data-faction-id');
        
        if (card.classList.contains('selected')) {
          // Отменяем выбор
          card.classList.remove('selected');
          appState.selectedFactions = appState.selectedFactions.filter(id => id !== factionId);
        } else if (appState.selectedFactions.length < selectCount) {
          // Выбираем фракцию
          card.classList.add('selected');
          appState.selectedFactions.push(factionId);
        }
        
        // Обновляем счетчик и состояние кнопки
        document.getElementById('selection-count').textContent = appState.selectedFactions.length;
        confirmButton.disabled = appState.selectedFactions.length !== selectCount;
      });
    });
    
    confirmButton.addEventListener('click', () => {
      if (!appState.selectionConfirmed) {
        confirmFactionSelection();
      }
    });
  }

  // Рендеринг страницы фазы банов
  function renderBanPhase(container) {
    // Добавим отладочный лог, чтобы увидеть состояние флага подтверждения
    console.log('renderBanPhase, selectionConfirmed:', appState.selectionConfirmed);
    
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
                <div class="faction-card ${appState.bannedFaction === faction.id ? 'selected' : ''}" 
                     data-faction-id="${faction.id}"
                     ${appState.selectionConfirmed ? 'disabled' : ''}>
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
        
        // Если подтверждение уже отправлено или карточка отключена, ничего не делаем
        if (appState.selectionConfirmed || card.hasAttribute('disabled')) {
          return;
        }
        
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
      if (!appState.selectionConfirmed) {
        confirmFactionBan();
      }
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
    if (!ids || !Array.isArray(ids)) return [];
    return ids.map(id => gwentFactions.find(faction => faction.id === id) || 
      { id: id, name: "Неизвестная фракция", image: "images/unknown-faction.png" });
  }

  // Рендеринг страницы результатов матча
  function renderMatchResults(container) {
    // Определяем, какую монетку получает каждый игрок
    const seed = appState.lobbyCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const isCreatorBlueCoin = seed % 2 === 0;
    
    const playerCoin = appState.isCreator ? (isCreatorBlueCoin ? 'blue' : 'red') : (isCreatorBlueCoin ? 'red' : 'blue');
    const opponentCoin = playerCoin === 'blue' ? 'red' : 'blue';
    
    // Находим забаненные фракции - начало исправлений
    // Определяем забаненную фракцию игрока
    const playerSelectedFactions = appState.selectedFactions;
    const playerRemainingFactions = appState.remainingFactions;
    const playerBannedFactionId = playerSelectedFactions.find(id => !playerRemainingFactions.includes(id));
    
    let playerBannedFaction;
    if (playerBannedFactionId && gwentFactions.some(f => f.id === playerBannedFactionId)) {
      playerBannedFaction = gwentFactions.find(f => f.id === playerBannedFactionId);
    } else {
      console.log('Не найдена забаненная фракция игрока:', playerBannedFactionId);
      playerBannedFaction = { 
        id: "unknown", 
        name: "Неизвестная фракция", 
        image: "images/unknown-faction.png" 
      };
    }
    
    // Определяем забаненную фракцию оппонента
    const opponentSelectedFactions = appState.opponentSelectedFactions;
    const opponentRemainingFactions = appState.opponentRemainingFactions;
    const opponentBannedFactionId = opponentSelectedFactions.find(id => !opponentRemainingFactions.includes(id));
    
    let opponentBannedFaction;
    if (opponentBannedFactionId && gwentFactions.some(f => f.id === opponentBannedFactionId)) {
      opponentBannedFaction = gwentFactions.find(f => f.id === opponentBannedFactionId);
    } else {
      console.log('Не найдена забаненная фракция оппонента:', opponentBannedFactionId);
      opponentBannedFaction = { 
        id: "unknown", 
        name: "Неизвестная фракция", 
        image: "images/unknown-faction.png" 
      };
    }
    // Конец исправлений для забаненных фракций
    
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Результаты выбора</h1>
        </div>
        
        <div class="gwent-content">
          <div class="match-info">
            <div class="player-results">
              <div class="player-header">
                <h3>Ваши доступные фракции:</h3>
                <div class="coin-indicator ${playerCoin}-coin"></div>
              </div>
              <div class="factions-grid results-grid">
                ${getFactionsByIds(appState.remainingFactions).map(faction => `
                  <div class="faction-card">
                    <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                    <div class="faction-name">${faction.name}</div>
                  </div>
                `).join('')}
              </div>
              <div class="banned-faction">
                <h4>Забанено оппонентом:</h4>
                <div class="faction-card banned">
                  <div class="faction-image" style="background-image: url('${playerBannedFaction.image}')"></div>
                  <div class="faction-name">${playerBannedFaction.name}</div>
                </div>
              </div>
            </div>
            
            <div class="opponent-results">
              <div class="player-header">
                <h3>Доступные фракции оппонента:</h3>
                <div class="coin-indicator ${opponentCoin}-coin"></div>
              </div>
              <div class="factions-grid results-grid">
                ${getFactionsByIds(appState.opponentRemainingFactions).map(faction => `
                  <div class="faction-card">
                    <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                    <div class="faction-name">${faction.name}</div>
                  </div>
                `).join('')}
              </div>
              <div class="banned-faction">
                <h4>Забанено вами:</h4>
                <div class="faction-card banned">
                  <div class="faction-image" style="background-image: url('${opponentBannedFaction.image}')"></div>
                  <div class="faction-name">${opponentBannedFaction.name}</div>
                </div>
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
    
    // Скрываем сообщение о ожидании, если оно отображается
    hideWaitingMessage();
    
    document.getElementById('new-match-btn').addEventListener('click', () => {
      resetLobby();
    });
    
    document.getElementById('return-home-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      throttledRenderApp();
    });
  }

  // Функции для работы с диалогами
  function showConfirmDialog(title, message, onConfirm, onCancel) {
    // Создаем диалог, если его еще нет
    let dialog = document.getElementById('gwent-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'gwent-dialog';
      dialog.className = 'gwent-dialog';
      document.body.appendChild(dialog);
    }
    
    dialog.innerHTML = `
      <div class="gwent-dialog-content">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="gwent-dialog-buttons">
          <button id="dialog-confirm" class="gwent-btn">Подтвердить</button>
          <button id="dialog-cancel" class="gwent-btn secondary">Отмена</button>
        </div>
      </div>
    `;
    
    dialog.style.display = 'flex';
    
    document.getElementById('dialog-confirm').addEventListener('click', onConfirm);
    document.getElementById('dialog-cancel').addEventListener('click', onCancel);
  }

  function hideDialog() {
    const dialog = document.getElementById('gwent-dialog');
    if (dialog) {
      dialog.style.display = 'none';
    }
  }

  // Функция для отображения сообщения о ожидании
  function showWaitingMessage(message) {
    let waitingMsg = document.getElementById('waiting-message');
    if (!waitingMsg) {
      waitingMsg = document.createElement('div');
      waitingMsg.id = 'waiting-message';
      waitingMsg.className = 'waiting-overlay';
      document.body.appendChild(waitingMsg);
    }
    
    waitingMsg.innerHTML = `
      <div class="waiting-content">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
    
    waitingMsg.style.display = 'flex';
  }

  function hideWaitingMessage() {
    const waitingMsg = document.getElementById('waiting-message');
    if (waitingMsg) {
      waitingMsg.style.display = 'none';
    }
  }

  // Функция для создания визуальных эффектов
  function createVisualEffects() {
    // Добавляем элементы для визуальных эффектов
    let smokeEffect = document.getElementById('smoke-effect');
    let particlesEffect = document.getElementById('particles-effect');
    
    if (!smokeEffect) {
      smokeEffect = document.createElement('div');
      smokeEffect.id = 'smoke-effect';
      smokeEffect.className = 'smoke-effect';
      document.body.appendChild(smokeEffect);
    }
    
    if (!particlesEffect) {
      particlesEffect = document.createElement('div');
      particlesEffect.id = 'particles-effect';
      particlesEffect.className = 'particles-effect';
      document.body.appendChild(particlesEffect);
    }
  }

  // Проверка производительности устройства
  function checkDevicePerformance() {
    // Простая проверка производительности
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      Math.sqrt(i);
    }
    const end = performance.now();
    
    // Если устройство медленное, отключаем сложные анимации
    if (end - start > 10) {
      document.body.classList.add('low-performance-device');
    }
  }

  // Добавляем стили для улучшения визуального эффекта при наведении и выборе фракций
  function addCustomStyles() {
    // Проверяем, существует ли уже элемент стиля
    let customStyle = document.getElementById('gwent-custom-styles');
    if (!customStyle) {
      customStyle = document.createElement('style');
      customStyle.id = 'gwent-custom-styles';
      document.head.appendChild(customStyle);
    }
    
    // Добавляем стили для улучшения внешнего вида
    customStyle.textContent = `
      /* Улучшение фонового изображения */
      .gwent-app {
        background-size: auto 100%;
        background-position: center;
        background-repeat: no-repeat;
        position: relative;
        overflow: hidden;
      }
      
      /* Эффект дыма */
      .smoke-effect {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: linear-gradient(rgba(0, 100, 100, 0.05), rgba(0, 50, 50, 0.1));
        opacity: 0.4;
        pointer-events: none;
        z-index: 1;
        animation: smokeMove 30s linear infinite;
      }
      
      @keyframes smokeMove {
        0% { transform: translate(0, 0); }
        50% { transform: translate(-10%, -10%); }
        100% { transform: translate(0, 0); }
      }
      
      /* Эффект светящихся частиц */
      .particles-effect {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: 
          radial-gradient(circle at 20% 30%, rgba(0, 255, 200, 0.15) 1px, transparent 2px),
          radial-gradient(circle at 70% 65%, rgba(0, 255, 200, 0.15) 1px, transparent 2px),
          radial-gradient(circle at 40% 85%, rgba(0, 255, 200, 0.15) 1px, transparent 2px),
          radial-gradient(circle at 85% 15%, rgba(0, 255, 200, 0.15) 1px, transparent 2px);
        background-size: 300px 300px;
        pointer-events: none;
        z-index: 2;
        animation: particlesMove 20s linear infinite;
      }
      
      @keyframes particlesMove {
        0% { background-position: 0px 0px, 0px 0px, 0px 0px, 0px 0px; }
        100% { background-position: 300px 300px, -300px 300px, 300px -300px, -300px -300px; }
      }
      
      /* Отключение анимаций на слабых устройствах */
      .low-performance-device .particles-effect,
      .low-performance-device .smoke-effect {
        display: none !important;
      }
      
      .low-performance-device .faction-card:hover {
        transform: none !important;
        box-shadow: 0 0 5px rgba(0, 255, 200, 0.7) !important;
      }
      
      /* Убедимся, что контент поверх анимаций */
      .gwent-content, .gwent-header {
        position: relative;
        z-index: 3;
      }
      
      /* Добавляем затемнение фона для лучшей читаемости */
      .gwent-content {
        background-color: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(1px);
      }
      
      /* Исправление для заголовка и кнопки "Назад" */
      .gwent-header {
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        padding: 15px 50px;
      }
      
      .gwent-back-btn {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #f4d03f;
        font-size: 1.2rem;
        cursor: pointer;
        z-index: 5;
        padding: 8px;
      }
      
      /* Исправление стилей для названий фракций */
      .faction-name {
        padding: 10px;
        text-align: center;
        background-color: rgba(0, 0, 0, 0.7);
        font-weight: bold;
        font-size: 0.9rem;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        word-break: break-word;
        overflow: hidden;
      }
      
      /* Стили для карточек фракций */
      .faction-card {
        width: 100%;
        height: 220px;
        display: flex;
        flex-direction: column;
        position: relative;
        background-color: rgba(0, 0, 0, 0.5);
        border: 2px solid #555;
        border-radius: 5px;
        overflow: hidden;
        transition: all 0.3s ease;
        cursor: pointer;
      }
      
      .faction-card:hover {
        transform: scale(1.07);
        box-shadow: 0 0 15px rgba(0, 255, 200, 0.7);
        z-index: 10;
        transition: all 0.2s ease-in-out;
      }
      
      /* Стили для выбранных карточек фракций */
      .faction-card.selected {
        transform: scale(1.08);
        box-shadow: 0 0 20px rgba(0, 255, 200, 0.9);
        border: 3px solid #00ffc8;
        z-index: 11;
      }
      
      /* Стили для отключенных карточек */
      .faction-card[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      
      /* Стили для изображений фракций */
      .faction-image {
        flex: 1;
        min-height: 180px;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      
      /* Предотвращение перекрытия соседних элементов */
      .factions-grid {
        gap: 15px;
        margin: 10px 0;
      }
      
      /* Стили для сетки фракций на стадии выбора */
      .select-factions .factions-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(2, auto);
        gap: 15px;
        width: 100%;
        max-width: 800px;
        margin: 0 auto 20px;
      }
      
      /* Стили для карточек на финальном экране */
      .results-grid .faction-card {
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .results-grid .faction-card:hover {
        transform: scale(1.05);
        box-shadow: 0 0 15px rgba(0, 255, 200, 0.7);
      }
      
      /* Стили для забаненных фракций на финальном экране */
      .banned-faction .faction-card.banned {
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .banned-faction .faction-card.banned:hover {
        transform: scale(1.05);
        box-shadow: 0 0 15px rgba(231, 76, 60, 0.7);
      }
      
      /* Адаптация для мобильных устройств */
      @media (max-width: 768px) {
        /* Увеличиваем размер кнопок для мобильных */
        .gwent-btn {
          padding: 16px;
          font-size: 16px;
          min-height: 50px;
        }
        
        /* Адаптация сетки фракций */
        .factions-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          grid-template-rows: repeat(3, auto) !important;
          gap: 10px !important;
        }
        
        /* Сжимаем заголовки */
        .gwent-header h1 {
          font-size: 1.1rem;
          max-width: 70%;
          text-align: center;
        }
        
        .gwent-back-btn {
          font-size: 1rem;
          padding: 10px;
        }
        
        /* Адаптируем диалоги */
        .gwent-dialog-content {
          width: 90%;
          max-width: 300px;
          padding: 15px;
        }
        
        /* Адаптируем экран результатов */
        .match-info {
          flex-direction: column;
        }
        
        .player-results, .opponent-results {
          width: 100%;
          margin-bottom: 20px;
        }
      }
      
      /* Адаптация для маленьких экранов (телефоны) */
      @media (max-width: 480px) {
        .faction-name {
          font-size: 0.8rem;
          padding: 5px;
        }
        
        .gwent-content {
          padding: 10px;
        }
        
        .player-form input, 
        .lobby-join-form input, 
        .format-selector select {
          font-size: 16px;
        }
        
        /* Исправление для Safari */
        .gwent-app {
          -webkit-background-size: auto 100%;
          background-attachment: scroll !important;
        }
      }
    `;
  }

  // Начальный рендеринг приложения и добавление стилей
  checkDevicePerformance(); // Проверяем производительность устройства
  renderApp();
  addCustomStyles();
  createVisualEffects();

  // Обработка фокуса на полях ввода для мобильной клавиатуры
  document.addEventListener('focus', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      // Прокручиваем страницу, чтобы элемент был виден
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, true);

  // Экспорт функций и состояния в глобальную область для отладки
  window.appState = appState;
  window.renderApp = renderApp;
  window.socket = socket;
});