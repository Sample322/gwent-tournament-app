const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// Инициализация Express приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Включаем сжатие ответов
app.use(compression());

// Определение порта
const PORT = process.env.PORT || 10000;

// Настройка middleware
app.use(express.json({ limit: '10kb' })); // Ограничиваем размер тела запроса

// Статические файлы с кэшированием
app.use(express.static(path.join(__dirname, '../client'), {
  maxAge: '1h' // Кэширование на 1 час
}));

// Подключение к MongoDB (с обработкой ошибок)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Подключено к MongoDB'))
    .catch(err => {
      console.error('Ошибка подключения к MongoDB:', err.message);
      console.log('Сервер запущен без подключения к MongoDB');
    });
}

// Хранение данных лобби с отслеживанием активности
const lobbies = {};

// Очистка неактивных лобби каждый час
setInterval(() => {
  const now = Date.now();
  Object.keys(lobbies).forEach(lobbyCode => {
    // Удаляем лобби, неактивные более 2 часов
    if (lobbies[lobbyCode].lastActivity && now - lobbies[lobbyCode].lastActivity > 7200000) {
      delete lobbies[lobbyCode];
      console.log(`Удалено неактивное лобби: ${lobbyCode}`);
    }
  });
}, 3600000);

// Проверка здоровья сервера
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API для создания лобби
app.post('/api/lobbies', (req, res) => {
  const { creator, tournamentFormat } = req.body;
  
  if (!creator || !creator.id) {
    return res.status(400).json({ message: 'Необходимо указать данные создателя лобби' });
  }
  
  // Генерируем уникальный код лобби
  const lobbyCode = generateLobbyCode();
  
  // Создаем лобби
  lobbies[lobbyCode] = {
    lobbyCode,
    creator,
    opponent: null,
    spectators: [],
    status: 'waiting',
    tournamentFormat: tournamentFormat || 'bo3',
    creatorSelectedFactions: [],
    opponentSelectedFactions: [],
    creatorBannedFaction: null,
    opponentBannedFaction: null,
    creatorRemainingFactions: [],
    opponentRemainingFactions: [],
    lastActivity: Date.now() // Добавляем отслеживание активности
  };
  
  res.status(201).json(lobbies[lobbyCode]);
});

// API для присоединения к лобби
app.put('/api/lobbies/:lobbyCode/join', (req, res) => {
  const { lobbyCode } = req.params;
  const { playerId, playerName, isSpectator } = req.body;
  
  if (!lobbies[lobbyCode]) {
    return res.status(404).json({ message: 'Лобби не найдено' });
  }
  
  // Обновляем отслеживание активности
  lobbies[lobbyCode].lastActivity = Date.now();
  
  if (isSpectator) {
    // Добавляем зрителя
    lobbies[lobbyCode].spectators.push({ id: playerId, name: playerName });
  } else {
    // Добавляем оппонента
    if (lobbies[lobbyCode].opponent) {
      return res.status(400).json({ message: 'Лобби уже заполнено' });
    }
    
    lobbies[lobbyCode].opponent = { id: playerId, name: playerName };
  }
  
  // Уведомляем всех участников о присоединении нового игрока
  io.to(lobbyCode).emit('player-joined', { playerId, playerName, isSpectator });
  
  // Отправляем обновленную информацию о лобби
  io.to(lobbyCode).emit('lobby-update', lobbies[lobbyCode]);
  
  res.status(200).json(lobbies[lobbyCode]);
});

// API для получения информации о лобби
app.get('/api/lobbies/:lobbyCode', (req, res) => {
  const { lobbyCode } = req.params;
  
  if (!lobbies[lobbyCode]) {
    return res.status(404).json({ message: 'Лобби не найдено' });
  }
  
  // Обновляем отслеживание активности
  lobbies[lobbyCode].lastActivity = Date.now();
  
  res.status(200).json(lobbies[lobbyCode]);
});

// Socket.IO события
io.on('connection', (socket) => {
  console.log('Новое соединение:', socket.id);
  
  // Присоединение к лобби
  socket.on('join-lobby', ({ lobbyCode, playerId, playerName }) => {
    if (!lobbies[lobbyCode]) {
      socket.emit('error', { message: 'Лобби не найдено' });
      return;
    }
    
    socket.join(lobbyCode);
    console.log(`Игрок ${playerId} присоединился к лобби ${lobbyCode}`);
    
    // Обновляем время активности лобби
    lobbies[lobbyCode].lastActivity = Date.now();
    
    // Отправляем обновленную информацию о лобби
    io.to(lobbyCode).emit('lobby-update', lobbies[lobbyCode]);
  });
  
  // Начало фазы выбора фракций
  socket.on('start-faction-selection', ({ lobbyCode }) => {
    if (!lobbies[lobbyCode]) return;
    
    lobbies[lobbyCode].status = 'selecting-factions';
    lobbies[lobbyCode].lastActivity = Date.now();
    
    io.to(lobbyCode).emit('faction-selection-started');
    io.to(lobbyCode).emit('lobby-update', lobbies[lobbyCode]);
  });
  
  // Подтверждение выбора фракций
  socket.on('confirm-faction-selection', ({ lobbyCode, playerId, selectedFactions }) => {
    if (!lobbies[lobbyCode]) return;
    
    const lobby = lobbies[lobbyCode];
    lobby.lastActivity = Date.now();
    
    if (lobby.creator && lobby.creator.id === playerId) {
      lobby.creatorSelectedFactions = selectedFactions;
    } else if (lobby.opponent && lobby.opponent.id === playerId) {
      lobby.opponentSelectedFactions = selectedFactions;
    }
    
    // Уведомляем всех о выборе фракций
    io.to(lobbyCode).emit('opponent-factions-selected', { playerId, selectedFactions });
    
    // Проверяем, все ли выбрали фракции
    if (lobby.creatorSelectedFactions.length > 0 && lobby.opponentSelectedFactions.length > 0) {
      lobby.status = 'banning';
      io.to(lobbyCode).emit('lobby-update', lobby);
    } else {
      io.to(lobbyCode).emit('lobby-update', lobby);
    }
  });
  
  // Подтверждение бана фракции
  socket.on('confirm-faction-ban', ({ lobbyCode, playerId, bannedFaction }) => {
    if (!lobbies[lobbyCode]) return;
    
    const lobby = lobbies[lobbyCode];
    lobby.lastActivity = Date.now();
    
    if (lobby.creator && lobby.creator.id === playerId) {
      lobby.creatorBannedFaction = bannedFaction;
      
      // Определяем оставшиеся фракции оппонента
      lobby.opponentRemainingFactions = [...lobby.opponentSelectedFactions].filter(f => f !== bannedFaction);
    } else if (lobby.opponent && lobby.opponent.id === playerId) {
      lobby.opponentBannedFaction = bannedFaction;
      
      // Определяем оставшиеся фракции создателя
      lobby.creatorRemainingFactions = [...lobby.creatorSelectedFactions].filter(f => f !== bannedFaction);
    }
    
    // Уведомляем всех о бане фракции
    io.to(lobbyCode).emit('opponent-faction-banned', { playerId, bannedFaction });
    
    // Проверяем, все ли забанили фракции
    if (lobby.creatorBannedFaction && lobby.opponentBannedFaction) {
      lobby.status = 'match-results';
      io.to(lobbyCode).emit('ban-phase-ended', { timeExpired: false });
      io.to(lobbyCode).emit('lobby-update', lobby);
    } else {
      io.to(lobbyCode).emit('lobby-update', lobby);
    }
  });
  
  // Отправка статуса выбора игрока
  socket.on('player-selection-status', ({ lobbyCode, playerId, status, phase }) => {
    if (!lobbies[lobbyCode]) return;
    lobbies[lobbyCode].lastActivity = Date.now();
    io.to(lobbyCode).emit('player-selection-status', { playerId, status, phase });
  });
  
  // Сброс лобби
  socket.on('reset-lobby', ({ lobbyCode }) => {
    if (!lobbies[lobbyCode]) return;
    
    const lobby = lobbies[lobbyCode];
    
    // Сохраняем информацию о игроках
    const { creator, opponent, spectators, tournamentFormat } = lobby;
    
    // Сбрасываем лобби
    lobbies[lobbyCode] = {
      lobbyCode,
      creator,
      opponent,
      spectators,
      status: 'waiting',
      tournamentFormat,
      creatorSelectedFactions: [],
      opponentSelectedFactions: [],
      creatorBannedFaction: null,
      opponentBannedFaction: null,
      creatorRemainingFactions: [],
      opponentRemainingFactions: [],
      lastActivity: Date.now()
    };
    
    io.to(lobbyCode).emit('lobby-update', lobbies[lobbyCode]);
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('Соединение разорвано:', socket.id);
    
    // В реальном приложении здесь можно добавить логику обработки отключения игрока
  });
});

// Генерация кода лобби
function generateLobbyCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    if (i < 3) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    } else {
      code += Math.floor(Math.random() * 10);
    }
  }
  
  // Проверяем уникальность кода
  if (lobbies[code]) {
    return generateLobbyCode();
  }
  
  return code;
}

// Обработка всех остальных маршрутов (для Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});