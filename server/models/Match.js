const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  lobbyCode: {
    type: String,
    required: true,
    index: true // Добавляем индекс для быстрого поиска
  },
  creator: {
    id: String,
    name: String
  },
  opponent: {
    id: String,
    name: String
  },
  tournamentStage: String,
  creatorFactions: [String],
  opponentFactions: [String],
  creatorBannedFaction: String,
  opponentBannedFaction: String,
  rounds: [{
    creatorFaction: String,
    opponentFaction: String,
    winner: String // 'creator' или 'opponent'
  }],
  winner: String, // 'creator' или 'opponent'
  completedAt: {
    type: Date,
    default: Date.now,
    index: true // Добавляем индекс для упрощения запросов по дате
  }
});

// Индексы для оптимизации запросов
MatchSchema.index({ 'creator.id': 1 });
MatchSchema.index({ 'opponent.id': 1 });

// Автоматическое удаление старых данных через 30 дней
MatchSchema.index({ completedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Match', MatchSchema);