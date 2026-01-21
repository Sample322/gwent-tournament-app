const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Match = sequelize.define('Match', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  lobbyCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'lobby_code'
  },
  
  // Создатель
  creatorId: {
    type: DataTypes.STRING(100),
    field: 'creator_id'
  },
  creatorName: {
    type: DataTypes.STRING(50),
    field: 'creator_name'
  },
  
  // Оппонент
  opponentId: {
    type: DataTypes.STRING(100),
    field: 'opponent_id'
  },
  opponentName: {
    type: DataTypes.STRING(50),
    field: 'opponent_name'
  },
  
  // Формат
  tournamentFormat: {
    type: DataTypes.STRING(10),
    defaultValue: 'bo3',
    field: 'tournament_format'
  },
  
  // Фракции (JSON массивы)
  creatorFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'creator_factions'
  },
  opponentFactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    field: 'opponent_factions'
  },
  
  // Баны
  creatorBannedFaction: {
    type: DataTypes.STRING(50),
    field: 'creator_banned_faction'
  },
  opponentBannedFaction: {
    type: DataTypes.STRING(50),
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
  
  // Результат
  winner: {
    type: DataTypes.ENUM('creator', 'opponent', 'draw'),
    allowNull: true
  },
  
  // Счет
  scoreCreator: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'score_creator'
  },
  scoreOpponent: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'score_opponent'
  },
  
  // Время завершения
  completedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'completed_at'
  }
}, {
  tableName: 'matches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['lobby_code'] },
    { fields: ['creator_id'] },
    { fields: ['opponent_id'] },
    { fields: ['completed_at'] }
  ]
});

// Статический метод для получения истории игрока
Match.getPlayerHistory = async function(playerId, limit = 10) {
  return this.findAll({
    where: {
      [Op.or]: [
        { creatorId: playerId },
        { opponentId: playerId }
      ]
    },
    order: [['completedAt', 'DESC']],
    limit
  });
};

module.exports = Match;
