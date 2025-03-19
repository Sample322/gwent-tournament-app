const Lobby = require('../models/Lobby');
const Match = require('../models/Match');

module.exports = (io) => {
  // Отслеживаем комнаты для таймеров банов
  const banTimers = {};
  
  io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);
    
    // Присоединение к комнате лобби
    socket.on('join-lobby', async ({ lobbyCode, playerId, playerName }) => {
      socket.join(lobbyCode);
      console.log(`Игрок ${playerId} (${playerName}) присоединился к лобби ${lobbyCode}`);
      
      // Обновление лобби в базе данных
      const lobby = await Lobby.findOne({ lobbyCode });
      if (lobby) {
        // Оповещение всех в лобби о новом игроке
        io.to(lobbyCode).emit('player-joined', { 
          playerId, 
          playerName, 
          isCreator: lobby.creator.id === playerId 
        });
        io.to(lobbyCode).emit('lobby-update', lobby);
      }
    });
    
    // Запуск фазы выбора фракций
    socket.on('start-faction-selection', async ({ lobbyCode }) => {
      try {
        const lobby = await Lobby.findOne({ lobbyCode });
        if (!lobby) return;
        
        lobby.status = 'selecting-factions';
        await lobby.save();
        
        io.to(lobbyCode).emit('faction-selection-started', { lobbyCode });
        io.to(lobbyCode).emit('lobby-update', lobby);
      } catch (error) {
        console.error('Ошибка запуска выбора фракций:', error);
      }
    });
    
    // Обработка статуса выбора игрока
    socket.on('player-selection-status', ({ lobbyCode, playerId, status, phase }) => {
      // Передаем статус всем в лобби
      socket.to(lobbyCode).emit('player-selection-status', { playerId, status, phase });
    });
    
    // Подтверждение выбора фракций
    socket.on('confirm-faction-selection', async ({ lobbyCode, playerId, selectedFactions }) => {
      try {
        const lobby = await Lobby.findOne({ lobbyCode });
        if (!lobby) return;
        
        // Определяем, создатель или оппонент
        const isCreator = playerId === lobby.creator.id;
        
        if (isCreator) {
          lobby.creatorSelectedFactions = selectedFactions;
        } else {
          lobby.opponentSelectedFactions = selectedFactions;
        }
        
        // Отправляем информацию о выборе всем в лобби
        socket.to(lobbyCode).emit('opponent-factions-selected', { 
          playerId, 
          selectedFactions 
        });
        
        // Если обе стороны выбрали фракции, переходим к фазе банов
        if (lobby.creatorSelectedFactions.length === 3 && lobby.opponentSelectedFactions.length === 3) {
          lobby.status = 'banning';
          
          // Запускаем таймер бана (3 минуты)
          banTimers[lobbyCode] = setTimeout(async () => {
            // Если время истекло, выбираем случайные баны
            const updatedLobby = await Lobby.findOne({ lobbyCode });
            
            if (updatedLobby && updatedLobby.status === 'banning') {
              if (!updatedLobby.creatorBannedFaction) {
                updatedLobby.creatorBannedFaction = updatedLobby.opponentSelectedFactions[Math.floor(Math.random() * 3)];
              }
              
              if (!updatedLobby.opponentBannedFaction) {
                updatedLobby.opponentBannedFaction = updatedLobby.creatorSelectedFactions[Math.floor(Math.random() * 3)];
              }
              
              // Рассчитываем оставшиеся фракции
              updatedLobby.creatorRemainingFactions = updatedLobby.creatorSelectedFactions.filter(
                faction => faction !== updatedLobby.opponentBannedFaction
              );
              
              updatedLobby.opponentRemainingFactions = updatedLobby.opponentSelectedFactions.filter(
                faction => faction !== updatedLobby.creatorBannedFaction
              );
              
              updatedLobby.status = 'match-results';
              await updatedLobby.save();
              
              io.to(lobbyCode).emit('ban-timer-expired');
              io.to(lobbyCode).emit('lobby-update', updatedLobby);
            }
            
            delete banTimers[lobbyCode];
          }, 180000); // 3 минуты
        }
        
        await lobby.save();
        io.to(lobbyCode).emit('lobby-update', lobby);
      } catch (error) {
        console.error('Ошибка подтверждения выбора фракций:', error);
      }
    });
    
    // Подтверждение бана фракции
    socket.on('confirm-faction-ban', async ({ lobbyCode, playerId, bannedFaction }) => {
      try {
        const lobby = await Lobby.findOne({ lobbyCode });
        if (!lobby) return;
        
        // Определяем, создатель или оппонент
        const isCreator = playerId === lobby.creator.id;
        
        if (isCreator) {
          lobby.creatorBannedFaction = bannedFaction;
        } else {
          lobby.opponentBannedFaction = bannedFaction;
        }
        
        // Отправляем информацию о бане всем в лобби
        socket.to(lobbyCode).emit('opponent-faction-banned', { 
          playerId, 
          bannedFaction 
        });
        
        // Если обе стороны выбрали баны, заканчиваем фазу банов
        if (lobby.creatorBannedFaction && lobby.opponentBannedFaction) {
          // Отменяем таймер бана
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
        }
        
        await lobby.save();
        io.to(lobbyCode).emit('lobby-update', lobby);
        
        if (lobby.status === 'match-results') {
          io.to(lobbyCode).emit('ban-phase-ended', { timeExpired: false });
        }
      } catch (error) {
        console.error('Ошибка подтверждения бана фракции:', error);
      }
    });
    
    // Сброс лобби для новой игры
    socket.on('reset-lobby', async ({ lobbyCode }) => {
      try {
        const lobby = await Lobby.findOne({ lobbyCode });
        if (!lobby) return;
        
        // Сохраняем завершенный матч в истории
        if (lobby.status === 'match-results') {
          const match = new Match({
            lobbyCode: lobby.lobbyCode,
            creator: lobby.creator,
            opponent: lobby.opponent,
            tournamentStage: lobby.tournamentStage,
            creatorFactions: lobby.creatorSelectedFactions,
            opponentFactions: lobby.opponentSelectedFactions,
            creatorBannedFaction: lobby.creatorBannedFaction,
            opponentBannedFaction: lobby.opponentBannedFaction,
            rounds: [],
            completedAt: new Date()
          });
          
          await match.save();
        }
        
        // Сбрасываем данные лобби для новой игры
        lobby.creatorSelectedFactions = [];
        lobby.opponentSelectedFactions = [];
        lobby.creatorBannedFaction = null;
        lobby.opponentBannedFaction = null;
        lobby.creatorRemainingFactions = [];
        lobby.opponentRemainingFactions = [];
        lobby.status = 'waiting';
        
        await lobby.save();
        io.to(lobbyCode).emit('lobby-update', lobby);
      } catch (error) {
        console.error('Ошибка сброса лобби:', error);
      }
    });
    
    // Отключение от сервера
    socket.on('disconnect', () => {
      console.log('Отключение:', socket.id);
    });
  });
};