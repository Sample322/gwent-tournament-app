// Импорт необходимых библиотек Telegram Mini Apps
const { WebApp } = window.Telegram;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
  // Настройка Telegram Mini App
  WebApp.ready();
  WebApp.expand();

  // Состояние приложения
  const appState = {
    currentPage: 'home',
    lobbyCode: null,
    isCreator: false,
    playerId: Math.random().toString(36).substring(2, 9),
    playerName: '',
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
  };

  // Фракции Гвинта с картинками
  const gwentFactions = [
    { id: 'northern-realms', name: 'Северные Королевства', image: 'images/northern-realms.png' },
    { id: 'nilfgaard', name: 'Нильфгаард', image: 'images/nilfgaard.png' },
    { id: 'monsters', name: 'Чудовища', image: 'images/monsters.png' },
    { id: 'scoia-tael', name: 'Скоя\'таэли', image: 'images/scoia-tael.png' },
    { id: 'skellige', name: 'Скеллиге', image: 'images/skellige.png' }
  ];

  // Функция рендеринга интерфейса в зависимости от текущей страницы
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

    // Запускаем фоновую музыку
    playBackgroundMusic();
  }

  // Рендеринг страницы создания лобби
  function renderCreateLobby(container) {
    // Генерируем уникальный код лобби
    appState.lobbyCode = generateLobbyCode();

    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <button id="back-btn" class="gwent-back-btn">← Назад</button>
          <h1>Создание лобби</h1>
        </div>
        
        <div class="gwent-content">
          <div class="lobby-info">
            <h2>Ваш код лобби:</h2>
            <div class="lobby-code">${appState.lobbyCode}</div>
            <p>Поделитесь этим кодом с другим игроком, чтобы он мог присоединиться.</p>
          </div>
          
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

    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      renderApp();
    });

    document.getElementById('tournament-stage').addEventListener('change', (e) => {
      appState.tournamentStage = e.target.value;
    });

    document.getElementById('start-lobby-btn').addEventListener('click', () => {
      // В реальном приложении здесь создается лобби на сервере
      // Для демонстрации мы просто переходим на страницу лобби
      appState.currentPage = 'lobby';
      renderApp();
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
          
          <button id="join-lobby-confirm-btn" class="gwent-btn">Присоединиться</button>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => {
      appState.currentPage = 'home';
      renderApp();
    });

    document.getElementById('join-lobby-confirm-btn').addEventListener('click', () => {
      const lobbyCodeInput = document.getElementById('lobby-code').value.trim().toUpperCase();
      
      if (!lobbyCodeInput) {
        alert('Пожалуйста, введите код лобби');
        return;
      }
      
      // В реальном приложении здесь проверка существования лобби на сервере
      // Для демонстрации мы просто принимаем любой код
      appState.lobbyCode = lobbyCodeInput;
      appState.isCreator = false;
      appState.currentPage = 'lobby';
      
      // Имитация данных оппонента для демонстрации
      appState.opponent = {
        id: 'opponent-id',
        name: 'Геральт из Ривии'
      };
      
      renderApp();
    });
  }

  // Рендеринг страницы лобби
  function renderLobby(container) {
    // Если это создатель, но оппонент еще не подключился, показываем экран ожидания
    const waitingForOpponent = appState.isCreator && !appState.opponent;
    
    if (waitingForOpponent) {
      container.innerHTML = `
        <div class="gwent-app">
          <div class="gwent-header">
            <button id="back-btn" class="gwent-back-btn">← Назад</button>
            <h1>Ожидание противника</h1>
          </div>
          
          <div class="gwent-content">
            <div class="waiting-screen">
              <div class="loading-spinner"></div>
              <h2>Ожидание подключения противника...</h2>
              <p>Код вашего лобби: <strong>${appState.lobbyCode}</strong></p>
            </div>
          </div>
        </div>
      `;
      
      document.getElementById('back-btn').addEventListener('click', () => {
        appState.currentPage = 'home';
        renderApp();
      });
      
      // В реальном приложении здесь был бы сетевой код ожидания подключения
      // Для демонстрации через 3 секунды мы симулируем подключение оппонента
      setTimeout(() => {
        appState.opponent = {
          id: 'opponent-id',
          name: 'Геральт из Ривии'
        };
        renderApp();
      }, 3000);
      
      return;
    }
    
    // Лобби с подключенным оппонентом
    container.innerHTML = `
      <div class="gwent-app">
        <div class="gwent-header">
          <h1>Лобби готово</h1>
          <div class="lobby-code-display">Код: ${appState.lobbyCode}</div>
        </div>
        
        <div class="gwent-content">
          <div class="lobby-players">
            <div class="player-card">
              <div class="player-avatar you"></div>
              <h3>${appState.playerName} (Вы)</h3>
            </div>
            
            <div class="versus-indicator">VS</div>
            
            <div class="player-card">
              <div class="player-avatar opponent"></div>
              <h3>${appState.opponent.name}</h3>
            </div>
          </div>
          
          <div class="tournament-info">
            <h3>Стадия турнира: ${getTournamentStageName(appState.tournamentStage)}</h3>
            <p>Формат: Best of 3</p>
          </div>
          
          ${appState.isCreator ? `
            <button id="start-match-btn" class="gwent-btn">Начать матч</button>
          ` : `
            <div class="waiting-message">Ожидание начала матча создателем лобби...</div>
          `}
          
          ${appState.isCreator ? '' : `
            <div class="spectator-option">
              <button id="spectator-mode-btn" class="gwent-btn secondary">Режим наблюдателя</button>
            </div>
          `}
        </div>
      </div>
    `;
    
    if (appState.isCreator) {
      document.getElementById('start-match-btn').addEventListener('click', () => {
        appState.currentPage = 'select-factions';
        renderApp();
      });
    }
    
    if (!appState.isCreator) {
      // В реальном приложении здесь был бы код ожидания начала матча
      // Для демонстрации через 5 секунд мы переходим на экран выбора фракций
      setTimeout(() => {
        appState.currentPage = 'select-factions';
        renderApp();
      }, 5000);
    }
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
            <p>Выбрано: <span id="selection-count">0</span>/3</p>
          </div>
          
          <div class="factions-grid">
            ${gwentFactions.map(faction => `
              <div class="faction-card" data-faction-id="${faction.id}">
                <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                <div class="faction-name">${faction.name}</div>
              </div>
            `).join('')}
          </div>
          
          <button id="confirm-selection-btn" class="gwent-btn" disabled>Подтвердить выбор</button>
        </div>
      </div>
    `;
    
    const factionCards = document.querySelectorAll('.faction-card');
    const selectionCountEl = document.getElementById('selection-count');
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
        selectionCountEl.textContent = appState.selectedFactions.length;
        confirmButton.disabled = appState.selectedFactions.length !== 3;
      });
    });
    
    confirmButton.addEventListener('click', () => {
      // В реальном приложении здесь отправка выбора на сервер
      // Для демонстрации имитируем выбор оппонента
      appState.opponentSelectedFactions = getRandomOpponentFactions();
      
      // Переходим к фазе банов
      appState.currentPage = 'ban-phase';
      renderApp();
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
                <div class="faction-card" data-faction-id="${faction.id}">
                  <div class="faction-image" style="background-image: url('${faction.image}')"></div>
                  <div class="faction-name">${faction.name}</div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <button id="confirm-ban-btn" class="gwent-btn" disabled>Подтвердить бан</button>
        </div>
      </div>
    `;
    
    // Запускаем таймер 3 минуты
    startBanTimer();
    
    const factionCards = document.querySelectorAll('.faction-card');
    const confirmButton = document.getElementById('confirm-ban-btn');
    
    factionCards.forEach(card => {
      card.addEventListener('click', () => {
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
      // В реальном приложении здесь отправка бана на сервер
      // Останавливаем таймер
      stopBanTimer();
      
      // Рассчитываем оставшиеся фракции
      calculateRemainingFactions();
      
      // Переходим к результатам
      appState.currentPage = 'match-results';
      renderApp();
    });
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
    
    document.getElementById('new-match-btn').addEventListener('click', () => {
      resetMatchState();
      appState.currentPage = 'select-factions';
      renderApp();
    });
    
    document.getElementById('return-home-btn').addEventListener('click', () => {
      resetAppState();
      appState.currentPage = 'home';
      renderApp();
    });
  }

  // Вспомогательные функции

  // Генерация уникального кода лобби
  function generateLobbyCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'GW';
    for (let i = 0; i < 4; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
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

  // Имитация выбора оппонента для демонстрации
  function getRandomOpponentFactions() {
    const allFactionIds = gwentFactions.map(faction => faction.id);
    const shuffled = [...allFactionIds].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }

  // Получение информации о фракциях по их ID
  function getFactionsByIds(ids) {
    return ids.map(id => gwentFactions.find(faction => faction.id === id));
  }

  // Запуск таймера банов
  function startBanTimer() {
    appState.timerRemaining = 180; // 3 минуты
    updateTimerDisplay();
    
    appState.timerInterval = setInterval(() => {
      appState.timerRemaining--;
      updateTimerDisplay();
      
      if (appState.timerRemaining <= 0) {
        stopBanTimer();
        // При истечении времени выбираем случайный бан
        if (!appState.bannedFaction) {
          const randomIndex = Math.floor(Math.random() * appState.opponentSelectedFactions.length);
          appState.bannedFaction = appState.opponentSelectedFactions[randomIndex];
          
          // Рассчитываем оставшиеся фракции
          calculateRemainingFactions();
          
          // Переходим к результатам
          appState.currentPage = 'match-results';
          renderApp();
        }
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

  // Остановка таймера банов
  function stopBanTimer() {
    if (appState.timerInterval) {
      clearInterval(appState.timerInterval);
      appState.timerInterval = null;
    }
  }

  // Расчет оставшихся фракций после бана
  function calculateRemainingFactions() {
    // Собственные оставшиеся фракции (имитация бана от оппонента)
    const opponentBannedFaction = appState.selectedFactions[Math.floor(Math.random() * appState.selectedFactions.length)];
    appState.remainingFactions = appState.selectedFactions.filter(id => id !== opponentBannedFaction);
    
    // Оставшиеся фракции оппонента после нашего бана
    appState.opponentRemainingFactions = appState.opponentSelectedFactions.filter(id => id !== appState.bannedFaction);
  }

  // Сброс состояния матча для нового раунда
  function resetMatchState() {
    appState.selectedFactions = [];
    appState.bannedFaction = null;
    appState.remainingFactions = [];
    appState.opponentSelectedFactions = [];
    appState.opponentRemainingFactions = [];
    appState.currentRound++;
  }

  // Полный сброс состояния приложения
  function resetAppState() {
    appState.currentPage = 'home';
    appState.lobbyCode = null;
    appState.isCreator = false;
    appState.opponent = null;
    appState.tournamentStage = 'quarter-finals';
    appState.selectedFactions = [];
    appState.bannedFaction = null;
    appState.remainingFactions = [];
    appState.opponentSelectedFactions = [];
    appState.opponentRemainingFactions = [];
    appState.currentRound = 1;
    stopBanTimer();
  }

  // Проигрывание фоновой музыки
  function playBackgroundMusic() {
    const music = new Audio('music/witcher-gwent-theme.mp3');
    music.loop = true;
    music.volume = 0.3;
    
    // Добавляем кнопку управления музыкой
    const musicButton = document.createElement('button');
    musicButton.classList.add('music-toggle');
    musicButton.innerHTML = '🔊';
    musicButton.title = 'Включить/выключить музыку';
    document.body.appendChild(musicButton);
    
    let musicPlaying = false;
    
    musicButton.addEventListener('click', () => {
      if (musicPlaying) {
        music.pause();
        musicButton.innerHTML = '🔇';
        musicPlaying = false;
      } else {
        music.play().catch(e => console.log('Автоматическое воспроизведение отключено браузером', e));
        musicButton.innerHTML = '🔊';
        musicPlaying = true;
      }
    });
    
    // В Telegram Mini Apps автоматическое воспроизведение может быть заблокировано,
    // поэтому начинаем воспроизведение по клику на кнопку
  }

  // Запускаем рендеринг приложения
  renderApp();
});