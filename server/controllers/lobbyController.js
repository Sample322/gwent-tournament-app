const Lobby = require('../models/Lobby');

// Генерация уникального кода лобби
const generateLobbyCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'GW';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Создание нового лобби
exports.createLobby = async (req, res) => {
  try {
    const { creator, tournamentFormat } = req.body;
    let { lobbyCode } = req.body;
    
    console.log(`Попытка создания лобби:`, { creator, tournamentFormat, lobbyCode });
    
    // Если код не предоставлен, генерируем его
    if (!lobbyCode) {
      lobbyCode = generateLobbyCode();
      
      // Проверяем, что код уникален
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 5) {
        const existingLobby = await Lobby.findOne({ lobbyCode });
        if (!existingLobby) {
          isUnique = true;
        } else {
          lobbyCode = generateLobbyCode();
          attempts++;
        }
      }
      
      if (!isUnique) {
        return res.status(500).json({ message: 'Не удалось создать уникальный код лобби' });
      }
    } else {
      // Проверяем, не занят ли уже предоставленный код
      const existingLobby = await Lobby.findOne({ lobbyCode });
      if (existingLobby) {
        return res.status(400).json({ message: 'Лобби с таким кодом уже существует' });
      }
    }
    
    // Создаем новое лобби
    const newLobby = new Lobby({
      lobbyCode,
      creator,
      tournamentFormat: tournamentFormat || 'bo3',
      status: 'waiting',
      opponent: null,
      creatorSelectedFactions: [],
      opponentSelectedFactions: [],
      creatorBannedFaction: null,
      opponentBannedFaction: null,
      creatorRemainingFactions: [],
      opponentRemainingFactions: []
    });
    
    await newLobby.save();
    console.log(`Лобби ${lobbyCode} успешно создано`);
    res.status(201).json(newLobby);
  } catch (error) {
    console.error('Ошибка создания лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при создании лобби' });
  }
};

// Получение данных лобби по коду
exports.getLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    
    const lobby = await Lobby.findOne({ lobbyCode });
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    res.status(200).json(lobby);
  } catch (error) {
    console.error('Ошибка получения лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при получении лобби' });
  }
};

// Присоединение к лобби
exports.joinLobby = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { playerId, playerName } = req.body;
    
    console.log(`Попытка присоединения к лобби ${lobbyCode}:`, { playerId, playerName });
    
    const lobby = await Lobby.findOne({ lobbyCode });
    if (!lobby) {
      console.log(`Лобби ${lobbyCode} не найдено`);
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    console.log(`Текущее состояние лобби ${lobbyCode}:`, {
      status: lobby.status,
      creator: lobby.creator,
      opponent: lobby.opponent || 'null'
    });
    
    // Проверяем, является ли игрок создателем
    if (lobby.creator && lobby.creator.id === playerId) {
      console.log(`Игрок ${playerId} является создателем лобби`);
      return res.status(200).json(lobby);
    }
    
    // Проверяем, является ли игрок уже оппонентом
    if (lobby.opponent && lobby.opponent.id === playerId) {
      console.log(`Игрок ${playerId} уже является оппонентом в лобби`);
      return res.status(200).json(lobby);
    }
    
    // Проверяем, не занята ли позиция оппонента
    if (lobby.opponent && lobby.opponent.id) {
      console.log(`Позиция оппонента уже занята игроком ${lobby.opponent.id}`);
      return res.status(400).json({ message: 'Лобби уже заполнено' });
    }
    
    // Если игра уже началась, нельзя присоединиться как игрок
    if (lobby.status !== 'waiting') {
      console.log(`Лобби в статусе ${lobby.status}, нельзя присоединиться`);
      return res.status(400).json({ message: 'Нельзя присоединиться к лобби, игра уже началась' });
    }
    
    // Добавляем игрока как оппонента
    console.log(`Добавление игрока ${playerId} как оппонента`);
    lobby.opponent = { id: playerId, name: playerName };
    
    await lobby.save();
    console.log(`Лобби ${lobbyCode} обновлено успешно`);
    console.log(`Новое состояние лобби:`, {
      status: lobby.status,
      creator: lobby.creator,
      opponent: lobby.opponent
    });
    res.status(200).json(lobby);
  } catch (error) {
    console.error('Ошибка присоединения к лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при присоединении к лобби' });
  }
};

// Обновление статуса лобби
exports.updateLobbyStatus = async (req, res) => {
  try {
    const { lobbyCode } = req.params;
    const { status } = req.body;
    
    const lobby = await Lobby.findOne({ lobbyCode });
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    lobby.status = status;
    await lobby.save();
    
    res.status(200).json(lobby);
  } catch (error) {
    console.error('Ошибка обновления статуса лобби:', error);
    res.status(500).json({ message: 'Ошибка сервера при обновлении статуса лобби' });
  }
};