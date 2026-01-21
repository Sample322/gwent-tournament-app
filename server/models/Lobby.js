const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Lobby = sequelize.define('Lobby', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  lobbyCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    field: 'lobby_code'
  },
  
  // Создатель
  creatorId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'creator_id'
  },
  creatorName: {
    type: DataTypes.STRING(50),
    defaultValue: 'Игрок 1',
    field: 'creator_name'
  },
  
  // Оппонент
  opponentId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'opponent_id'
  },
  opponentName: {
    type: DataTypes.STRING(50),
    defaultValue: 'Игрок 2',
    field: 'opponent_name'
  },
  
  // Формат турнира
  tournamentFormat: {
    type: DataTypes.ENUM('bo3', 'bo5'),
    defaultValue: 'bo3',
    field: 'tournament_format'
  },
  
  // Статус
  status: {
    type: DataTypes.ENUM('waiting', 'selecting-factions', 'banning', 'match-results'),
    defaultValue: 'waiting'
  },
  
  // Выбранные фракции (хранятся как JSON массивы)
  creatorSelectedFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'creator_selected_factions'
  },
  opponentSelectedFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'opponent_selected_factions'
  },
  
  // Забаненные фракции
  creatorBannedFaction: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'creator_banned_faction'
  },
  opponentBannedFaction: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'opponent_banned_faction'
  },
  
  // Оставшиеся фракции
  creatorRemainingFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'creator_remaining_factions'
  },
  opponentRemainingFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'opponent_remaining_factions'
  },
  
  // Время последней активности
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_activity'
  }
}, {
  tableName: 'lobbies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['lobby_code'], unique: true },
    { fields: ['status'] },
    { fields: ['last_activity'] },
    { fields: ['creator_id'] }
  ]
});

// Методы экземпляра
Lobby.prototype.isParticipant = function(playerId) {
  return this.creatorId === playerId || this.opponentId === playerId;
};

Lobby.prototype.getPlayerRole = function(playerId) {
  if (this.creatorId === playerId) return 'creator';
  if (this.opponentId === playerId) return 'opponent';
  return null;
};

// Преобразование в формат для API (совместимый с предыдущей версией)
Lobby.prototype.toAPIFormat = function() {
  return {
    lobbyCode: this.lobbyCode,
    creator: {
      id: this.creatorId,
      name: this.creatorName
    },
    opponent: this.opponentId ? {
      id: this.opponentId,
      name: this.opponentName
    } : null,
    tournamentFormat: this.tournamentFormat,
    status: this.status,
    creatorSelectedFactions: this.creatorSelectedFactions || [],
    opponentSelectedFactions: this.opponentSelectedFactions || [],
    creatorBannedFaction: this.creatorBannedFaction,
    opponentBannedFaction: this.opponentBannedFaction,
    creatorRemainingFactions: this.creatorRemainingFactions || [],
    opponentRemainingFactions: this.opponentRemainingFactions || [],
    lastActivity: this.lastActivity,
    createdAt: this.created_at
  };
};

// Статический метод для очистки старых лобби
Lobby.cleanupOldLobbies = async function(hoursOld = 3) {
  const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  const result = await this.destroy({
    where: {
      lastActivity: { [Op.lt]: cutoffTime }
    }
  });
  return result;
};

module.exports = Lobby;
