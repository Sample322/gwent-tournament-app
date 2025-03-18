const Lobby = require('../models/Lobby');

module.exports = (io) => {
  // Отслеживание таймеров банов по комнатам
  const banTimers = {};
  
  io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);
    
    // Присоединение к комнате (лобби)
    socket.on('join-lobby', async ({ lobbyCode, playerId }) => {
      socket.join(lobbyCode);
      console.log(`Игрок ${playerId} присоединился к лобби ${lobbyCode}`);
      
      // Отправка текущего состояния лобби
      const lobby = await Lobby.findOne({ lobbyCode });
      if (lobby) {
        io.to(lobbyCode).emit('lobby-update', lobby);
      }
    });
    
    // Начало фазы выбора фракций
    socket.on('start-faction-selection', async ({ lobbyCode }) => {
      try {
        const lobby = await Lobby.findOne({ lobbyCode });
        if (!lobby) return;
        
        lobby.status = 'selecting-factions';
        await lobby.save();
        
        io.to(lobbyCode).emit('lobby-update', lobby);
      } catch (error) {
        console.error('Ошибка запуска выбора фракций:', error);
      }
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
          // Здесь можно добавить код для сохранения истории матча
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
      console.log('Пользователь отключился:', socket.id);
    });
  });
};