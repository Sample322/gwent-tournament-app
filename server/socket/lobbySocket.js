const Lobby = require('../models/Lobby');
const Match = require('../models/Match');

module.exports = (io) => {
  // Отслеживаем комнаты для таймеров банов и выбора
  const banTimers = {};
  const selectionTimers = {};
  
  // Отслеживаем подключения игроков
  const playerConnections = new Map();
  
  // Отслеживаем состояние выбора игроков (in-memory для быстродействия)
  const playerSelectionState = new Map();
  
  // Константы таймеров
  const SELECTION_TIMEOUT = 300000; // 5 минут на выбор фракций
  const BAN_TIMEOUT = 180000; // 3 минуты на бан
  
  // Список фракций Gwent
  const GWENT_FACTIONS = ['monsters', 'nilfgaard', 'northern', 'scoiatael', 'skellige', 'syndicate'];
  
  // Функция очистки ресурсов лобби
  function cleanupLobbyResources(lobbyCode) {
    if (banTimers[lobbyCode]) {
      clearTimeout(banTimers[lobbyCode]);
      delete banTimers[lobbyCode];
    }
    if (selectionTimers[lobbyCode]) {
      clearTimeout(selectionTimers[lobbyCode]);
      delete selectionTimers[lobbyCode];
    }
    playerSelectionState.delete(lobbyCode);
    console.log(`🧹 Ресурсы лобби ${lobbyCode} очищены`);
  }
  
  // Инициализация состояния выбора для лобби
  function initSelectionState(lobbyCode) {
    if (!playerSelectionState.has(lobbyCode)) {
      playerSelectionState.set(lobbyCode, {});
    }
    return playerSelectionState.get(lobbyCode);
  }
  
  // Получение состояния игрока
  function getPlayerState(lobbyCode, playerId) {
    const lobbyState = initSelectionState(lobbyCode);
    if (!lobbyState[playerId]) {
      lobbyState[playerId] = {
        selections: [],
        bannedFaction: null,
        selectionConfirmed: false,
        banConfirmed: false,
        phase: 'waiting'
      };
    }
    return lobbyState[playerId];
  }
  
  // Heartbeat для отслеживания активных соединений
  setInterval(() => {
    io.emit('heartbeat', { timestamp: Date.now() });
  }, 30000);
  
  io.on('connection', (socket) => {
    console.log('🔌 Новое подключение:', socket.id);
    
    // Присоединение к комнате лобби
    socket.on('join-lobby', async ({ lobbyCode, playerId, playerName }) => {
      try {
        socket.join(lobbyCode);
        console.log(`👤 Игрок ${playerId} (${playerName}) присоединился к лобби ${lobbyCode}`);
        
        // Сохраняем информацию о соединении игрока
        playerConnections.set(socket.id, { lobbyCode, playerId, playerName });
        
        // Инициализируем состояние игрока
        getPlayerState(lobbyCode, playerId);
        
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (lobby) {
          lobby.lastActivity = new Date();
          await lobby.save();
          
          // Оповещение всех в лобби о новом игроке
          io.to(lobbyCode).emit('player-joined', { 
            playerId, 
            playerName, 
            isCreator: lobby.creatorId === playerId 
          });
          
          // Отправляем текущее состояние лобби
          io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
        }
      } catch (error) {
        console.error('❌ Ошибка при присоединении к лобби:', error);
        socket.emit('error', { message: 'Ошибка при присоединении к лобби' });
      }
    });
    
    // Запуск фазы выбора фракций
    socket.on('start-faction-selection', async ({ lobbyCode }) => {
      try {
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (!lobby) {
          socket.emit('error', { message: 'Лобби не найдено' });
          return;
        }
        
        // Сбрасываем состояние выбора
        const lobbyState = initSelectionState(lobbyCode);
        if (lobby.creatorId) {
          lobbyState[lobby.creatorId] = {
            selections: [],
            bannedFaction: null,
            selectionConfirmed: false,
            banConfirmed: false,
            phase: 'selecting'
          };
        }
        if (lobby.opponentId) {
          lobbyState[lobby.opponentId] = {
            selections: [],
            bannedFaction: null,
            selectionConfirmed: false,
            banConfirmed: false,
            phase: 'selecting'
          };
        }
        
        lobby.status = 'selecting-factions';
        lobby.creatorSelectedFactions = [];
        lobby.opponentSelectedFactions = [];
        lobby.lastActivity = new Date();
        await lobby.save();
        
        io.to(lobbyCode).emit('faction-selection-started', { lobbyCode });
        io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
        
        // Запускаем таймер на выбор фракций
        if (selectionTimers[lobbyCode]) {
          clearTimeout(selectionTimers[lobbyCode]);
        }
        
        selectionTimers[lobbyCode] = setTimeout(async () => {
          await handleSelectionTimeout(lobbyCode);
        }, SELECTION_TIMEOUT);
        
        console.log(`🎮 Фаза выбора фракций начата для лобби ${lobbyCode}`);
      } catch (error) {
        console.error('❌ Ошибка запуска выбора фракций:', error);
        socket.emit('error', { message: 'Ошибка запуска выбора фракций' });
      }
    });
    
    // Сохранение прогресса выбора (без подтверждения)
    socket.on('save-selection-progress', ({ lobbyCode, playerId, selections, phase }) => {
      try {
        const playerState = getPlayerState(lobbyCode, playerId);
        
        // Сохраняем прогресс только если не подтверждено
        if (phase === 'selecting' && !playerState.selectionConfirmed) {
          playerState.selections = selections;
        } else if (phase === 'banning' && !playerState.banConfirmed) {
          playerState.bannedFaction = selections[0] || null;
        }
        
        // Отправляем оппоненту информацию о прогрессе
        socket.to(lobbyCode).emit('opponent-selection-progress', {
          playerId,
          phase,
          selectionsCount: selections.length,
          hasSelection: selections.length > 0
        });
      } catch (error) {
        console.error('❌ Ошибка сохранения прогресса:', error);
      }
    });
    
    // Подтверждение выбора фракций
    socket.on('confirm-faction-selection', async ({ lobbyCode, playerId, selectedFactions }) => {
      try {
        console.log(`✅ Игрок ${playerId} подтверждает выбор в лобби ${lobbyCode}:`, selectedFactions);
        
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (!lobby) {
          socket.emit('error', { message: 'Лобби не найдено' });
          return;
        }
        
        // Обновляем состояние игрока
        const playerState = getPlayerState(lobbyCode, playerId);
        playerState.selections = selectedFactions;
        playerState.selectionConfirmed = true;
        playerState.phase = 'selecting-confirmed';
        
        const isCreator = playerId === lobby.creatorId;
        
        // Сохраняем в базу
        if (isCreator) {
          lobby.creatorSelectedFactions = selectedFactions;
        } else {
          lobby.opponentSelectedFactions = selectedFactions;
        }
        lobby.lastActivity = new Date();
        
        // Отправляем подтверждение отправителю
        socket.emit('selection-confirmed', { 
          playerId, 
          phase: 'selecting',
          success: true 
        });
        
        // Оповещаем оппонента о завершении выбора
        socket.to(lobbyCode).emit('player-selection-status', { 
          playerId, 
          status: 'completed', 
          phase: 'selecting-factions'
        });
        
        // Проверяем, оба ли игрока подтвердили выбор
        const creatorState = getPlayerState(lobbyCode, lobby.creatorId);
        const opponentState = getPlayerState(lobbyCode, lobby.opponentId);
        
        const bothConfirmed = creatorState?.selectionConfirmed && opponentState?.selectionConfirmed;
        
        console.log(`📊 Статус подтверждений в ${lobbyCode}: Creator=${creatorState?.selectionConfirmed}, Opponent=${opponentState?.selectionConfirmed}`);
        
        if (bothConfirmed && 
            lobby.creatorSelectedFactions.length > 0 && 
            lobby.opponentSelectedFactions.length > 0) {
          
          // Очищаем таймер выбора
          if (selectionTimers[lobbyCode]) {
            clearTimeout(selectionTimers[lobbyCode]);
            delete selectionTimers[lobbyCode];
          }
          
          // Переходим к фазе банов
          lobby.status = 'banning';
          
          // Сбрасываем состояния бана
          if (creatorState) {
            creatorState.banConfirmed = false;
            creatorState.bannedFaction = null;
            creatorState.phase = 'banning';
          }
          if (opponentState) {
            opponentState.banConfirmed = false;
            opponentState.bannedFaction = null;
            opponentState.phase = 'banning';
          }
          
          await lobby.save();
          
          console.log(`🚫 Переход к фазе банов в лобби ${lobbyCode}`);
          
          // Оповещаем всех о переходе к фазе банов
          io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
          io.to(lobbyCode).emit('phase-changed', { phase: 'banning' });
          
          // Запускаем таймер бана
          startBanTimer(lobbyCode);
        } else {
          await lobby.save();
          socket.emit('lobby-update', lobby.toAPIFormat());
        }
      } catch (error) {
        console.error('❌ Ошибка подтверждения выбора фракций:', error);
        socket.emit('error', { message: 'Ошибка подтверждения выбора' });
      }
    });
    
    // Подтверждение бана фракции
    socket.on('confirm-faction-ban', async ({ lobbyCode, playerId, bannedFaction }) => {
      try {
        console.log(`🚫 Игрок ${playerId} банит фракцию в лобби ${lobbyCode}:`, bannedFaction);
        
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (!lobby) {
          socket.emit('error', { message: 'Лобби не найдено' });
          return;
        }
        
        // Обновляем состояние игрока
        const playerState = getPlayerState(lobbyCode, playerId);
        playerState.bannedFaction = bannedFaction;
        playerState.banConfirmed = true;
        playerState.phase = 'banning-confirmed';
        
        const isCreator = playerId === lobby.creatorId;
        
        // Сохраняем в базу
        if (isCreator) {
          lobby.creatorBannedFaction = bannedFaction;
        } else {
          lobby.opponentBannedFaction = bannedFaction;
        }
        lobby.lastActivity = new Date();
        
        // Отправляем подтверждение отправителю
        socket.emit('ban-confirmed', { 
          playerId, 
          phase: 'banning',
          success: true 
        });
        
        // Оповещаем оппонента
        socket.to(lobbyCode).emit('player-selection-status', { 
          playerId, 
          status: 'completed', 
          phase: 'ban-phase'
        });
        
        // Проверяем, оба ли игрока забанили
        const creatorState = getPlayerState(lobbyCode, lobby.creatorId);
        const opponentState = getPlayerState(lobbyCode, lobby.opponentId);
        
        const bothBanned = creatorState?.banConfirmed && opponentState?.banConfirmed;
        
        console.log(`📊 Статус банов в ${lobbyCode}: Creator=${creatorState?.banConfirmed}, Opponent=${opponentState?.banConfirmed}`);
        
        if (bothBanned && lobby.creatorBannedFaction && lobby.opponentBannedFaction) {
          // Очищаем таймер бана
          if (banTimers[lobbyCode]) {
            clearTimeout(banTimers[lobbyCode]);
            delete banTimers[lobbyCode];
          }
          
          // Рассчитываем оставшиеся фракции
          lobby.creatorRemainingFactions = lobby.creatorSelectedFactions.filter(
            faction => faction !== lobby.opponentBannedFaction
          );
          lobby.opponentRemainingFactions = lobby.opponentSelectedFactions.filter(
            faction => faction !== lobby.creatorBannedFaction
          );
          
          lobby.status = 'match-results';
          await lobby.save();
          
          console.log(`🏆 Матч завершен в лобби ${lobbyCode}`);
          
          io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
          io.to(lobbyCode).emit('ban-phase-ended', { timeExpired: false });
        } else {
          await lobby.save();
          socket.emit('lobby-update', lobby.toAPIFormat());
        }
      } catch (error) {
        console.error('❌ Ошибка подтверждения бана фракции:', error);
        socket.emit('error', { message: 'Ошибка подтверждения бана' });
      }
    });
    
    // Сброс лобби для новой игры
    socket.on('reset-lobby', async ({ lobbyCode }) => {
      try {
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (!lobby) return;
        
        // Сохраняем завершенный матч в истории
        if (lobby.status === 'match-results') {
          try {
            await Match.create({
              lobbyCode: lobby.lobbyCode,
              creatorId: lobby.creatorId,
              creatorName: lobby.creatorName,
              opponentId: lobby.opponentId,
              opponentName: lobby.opponentName,
              tournamentFormat: lobby.tournamentFormat,
              creatorFactions: lobby.creatorSelectedFactions,
              opponentFactions: lobby.opponentSelectedFactions,
              creatorBannedFaction: lobby.creatorBannedFaction,
              opponentBannedFaction: lobby.opponentBannedFaction,
              creatorRemainingFactions: lobby.creatorRemainingFactions,
              opponentRemainingFactions: lobby.opponentRemainingFactions,
              completedAt: new Date()
            });
            console.log(`📝 Матч сохранен для лобби ${lobbyCode}`);
          } catch (err) {
            console.error('❌ Ошибка сохранения матча:', err);
          }
        }
        
        // Очищаем все состояния
        cleanupLobbyResources(lobbyCode);
        
        // Инициализируем новое состояние
        const lobbyState = initSelectionState(lobbyCode);
        if (lobby.creatorId) {
          lobbyState[lobby.creatorId] = {
            selections: [],
            bannedFaction: null,
            selectionConfirmed: false,
            banConfirmed: false,
            phase: 'waiting'
          };
        }
        if (lobby.opponentId) {
          lobbyState[lobby.opponentId] = {
            selections: [],
            bannedFaction: null,
            selectionConfirmed: false,
            banConfirmed: false,
            phase: 'waiting'
          };
        }
        
        // Сбрасываем данные лобби
        lobby.creatorSelectedFactions = [];
        lobby.opponentSelectedFactions = [];
        lobby.creatorBannedFaction = null;
        lobby.opponentBannedFaction = null;
        lobby.creatorRemainingFactions = [];
        lobby.opponentRemainingFactions = [];
        lobby.status = 'waiting';
        lobby.lastActivity = new Date();
        
        await lobby.save();
        
        console.log(`🔄 Лобби ${lobbyCode} сброшено для новой игры`);
        io.to(lobbyCode).emit('lobby-reset', { lobbyCode });
        io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
      } catch (error) {
        console.error('❌ Ошибка сброса лобби:', error);
        socket.emit('error', { message: 'Ошибка сброса лобби' });
      }
    });
    
    // Отключение от сервера
    socket.on('disconnect', async () => {
      console.log('🔌 Отключение:', socket.id);
      
      const connectionInfo = playerConnections.get(socket.id);
      if (connectionInfo) {
        const { lobbyCode, playerId } = connectionInfo;
        playerConnections.delete(socket.id);
        
        // Оповещаем оппонента об отключении
        socket.to(lobbyCode).emit('player-disconnected', { playerId });
        
        // Проверяем, остались ли игроки в лобби
        try {
          const clients = await io.in(lobbyCode).allSockets();
          if (clients.size === 0) {
            console.log(`🏚️ Последний игрок покинул лобби ${lobbyCode}`);
            cleanupLobbyResources(lobbyCode);
          }
        } catch (err) {
          console.error('❌ Ошибка при проверке активных клиентов:', err);
        }
      }
    });
    
    // Переподключение игрока
    socket.on('reconnect-player', async ({ lobbyCode, playerId }) => {
      try {
        const lobby = await Lobby.findOne({ where: { lobbyCode } });
        if (!lobby) {
          socket.emit('error', { message: 'Лобби не найдено' });
          return;
        }
        
        socket.join(lobbyCode);
        playerConnections.set(socket.id, { lobbyCode, playerId });
        
        // Восстанавливаем состояние игрока
        const playerState = getPlayerState(lobbyCode, playerId);
        
        socket.emit('reconnect-success', {
          lobby: lobby.toAPIFormat(),
          playerState: {
            selections: playerState.selections,
            bannedFaction: playerState.bannedFaction,
            selectionConfirmed: playerState.selectionConfirmed,
            banConfirmed: playerState.banConfirmed,
            phase: playerState.phase
          }
        });
        
        socket.to(lobbyCode).emit('player-reconnected', { playerId });
        
        console.log(`🔄 Игрок ${playerId} переподключился к лобби ${lobbyCode}`);
      } catch (error) {
        console.error('❌ Ошибка переподключения:', error);
        socket.emit('error', { message: 'Ошибка переподключения' });
      }
    });
  });
  
  // Запуск таймера бана
  function startBanTimer(lobbyCode) {
    if (banTimers[lobbyCode]) {
      clearTimeout(banTimers[lobbyCode]);
    }
    
    banTimers[lobbyCode] = setTimeout(async () => {
      await handleBanTimeout(lobbyCode);
    }, BAN_TIMEOUT);
    
    console.log(`⏱️ Таймер бана запущен для лобби ${lobbyCode} (${BAN_TIMEOUT/1000} сек)`);
  }
  
  // Обработка таймаута выбора фракций
  async function handleSelectionTimeout(lobbyCode) {
    try {
      console.log(`⏰ Таймаут выбора фракций в лобби ${lobbyCode}`);
      
      const lobby = await Lobby.findOne({ where: { lobbyCode } });
      if (!lobby || lobby.status !== 'selecting-factions') return;
      
      const requiredCount = lobby.tournamentFormat === 'bo5' ? 4 : 3;
      
      // Автовыбор для игроков, которые не выбрали
      if (lobby.creatorSelectedFactions.length < requiredCount) {
        const available = GWENT_FACTIONS.filter(f => !lobby.creatorSelectedFactions.includes(f));
        while (lobby.creatorSelectedFactions.length < requiredCount && available.length > 0) {
          const randomIndex = Math.floor(Math.random() * available.length);
          lobby.creatorSelectedFactions.push(available.splice(randomIndex, 1)[0]);
        }
        console.log(`🤖 Автовыбор для создателя в ${lobbyCode}:`, lobby.creatorSelectedFactions);
      }
      
      if (lobby.opponentSelectedFactions.length < requiredCount) {
        const available = GWENT_FACTIONS.filter(f => !lobby.opponentSelectedFactions.includes(f));
        while (lobby.opponentSelectedFactions.length < requiredCount && available.length > 0) {
          const randomIndex = Math.floor(Math.random() * available.length);
          lobby.opponentSelectedFactions.push(available.splice(randomIndex, 1)[0]);
        }
        console.log(`🤖 Автовыбор для оппонента в ${lobbyCode}:`, lobby.opponentSelectedFactions);
      }
      
      lobby.status = 'banning';
      lobby.lastActivity = new Date();
      await lobby.save();
      
      delete selectionTimers[lobbyCode];
      
      io.to(lobbyCode).emit('selection-timer-expired');
      io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
      io.to(lobbyCode).emit('phase-changed', { phase: 'banning' });
      
      startBanTimer(lobbyCode);
    } catch (error) {
      console.error('❌ Ошибка в handleSelectionTimeout:', error);
    }
  }
  
  // Обработка таймаута бана
  async function handleBanTimeout(lobbyCode) {
    try {
      console.log(`⏰ Таймаут бана в лобби ${lobbyCode}`);
      
      const lobby = await Lobby.findOne({ where: { lobbyCode } });
      if (!lobby || lobby.status !== 'banning') return;
      
      // Автовыбор банов
      if (!lobby.creatorBannedFaction && lobby.opponentSelectedFactions.length > 0) {
        const randomIndex = Math.floor(Math.random() * lobby.opponentSelectedFactions.length);
        lobby.creatorBannedFaction = lobby.opponentSelectedFactions[randomIndex];
        console.log(`🤖 Автобан для создателя в ${lobbyCode}:`, lobby.creatorBannedFaction);
      }
      
      if (!lobby.opponentBannedFaction && lobby.creatorSelectedFactions.length > 0) {
        const randomIndex = Math.floor(Math.random() * lobby.creatorSelectedFactions.length);
        lobby.opponentBannedFaction = lobby.creatorSelectedFactions[randomIndex];
        console.log(`🤖 Автобан для оппонента в ${lobbyCode}:`, lobby.opponentBannedFaction);
      }
      
      // Рассчитываем оставшиеся фракции
      lobby.creatorRemainingFactions = lobby.creatorSelectedFactions.filter(
        faction => faction !== lobby.opponentBannedFaction
      );
      lobby.opponentRemainingFactions = lobby.opponentSelectedFactions.filter(
        faction => faction !== lobby.creatorBannedFaction
      );
      
      lobby.status = 'match-results';
      lobby.lastActivity = new Date();
      await lobby.save();
      
      delete banTimers[lobbyCode];
      
      io.to(lobbyCode).emit('ban-timer-expired');
      io.to(lobbyCode).emit('lobby-update', lobby.toAPIFormat());
      io.to(lobbyCode).emit('ban-phase-ended', { timeExpired: true });
      
      console.log(`🏆 Матч завершен (таймаут) в лобби ${lobbyCode}`);
    } catch (error) {
      console.error('❌ Ошибка в handleBanTimeout:', error);
    }
  }
};
