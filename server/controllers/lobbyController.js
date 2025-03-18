const Lobby = require('../models/Lobby');
const Match = require('../models/Match');

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
    const { creator, tournamentStage } = req.body;
    let { lobbyCode } = req.body;
    
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
      tournamentStage: tournamentStage || 'quarter-finals',
      status: 'waiting'
    });
    
    await newLobby.save();
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
    const { playerId, playerName, isSpectator } = req.body;
    
    const lobby = await Lobby.findOne({ lobbyCode });
    if (!lobby) {
      return res.status(404).json({ message: 'Лобби не найдено' });
    }
    
    // Если лобби уже не в статусе ожидания
    if (lobby.status !== 'waiting') {
      return res.status(400).json({ message: 'Нельзя присоединиться к лобби, игра уже началась' });
    }
    
    if (isSpectator) {
      // Проверяем, не является ли уже зрителем
      const isAlreadySpectator = lobby.spectators.some(s => s.id === playerId);
      if (!isAlreadySpectator) {
        lobby.spectators.push({ id: playerId, name: playerName });
      }
    } else {
      // Проверяем, не является ли создателем
      if (lobby.creator.id === playerId) {
        return res.status(200).json(lobby); // Уже в лобби как создатель
      }
      
      // Проверяем, не занята ли уже позиция оппонента
      if (lobby.opponent && lobby.opponent.id !== playerId) {
        return res.status(400).json({ message: 'Лобби уже заполнено, вы можете присоединиться как зритель' });
      }
      
      // Устанавливаем как оппонента
      lobby.opponent = { id: playerId, name: playerName };
    }
    
    await lobby.save();
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