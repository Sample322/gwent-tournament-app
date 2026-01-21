const mongoose = require('mongoose');

const RoundSchema = new mongoose.Schema({
  roundNumber: { type: Number, required: true },
  creatorFaction: { type: String },
  opponentFaction: { type: String },
  winner: { type: String, enum: ['creator', 'opponent', 'draw', null], default: null },
  notes: { type: String }
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  lobbyCode: {
    type: String,
    required: true,
    index: true
  },
  creator: {
    id: String,
    name: String
  },
  opponent: {
    id: String,
    name: String
  },
  tournamentStage: {
    type: String,
    default: 'bo3'
  },
  // Выбранные фракции
  creatorFactions: {
    type: [String],
    default: []
  },
  opponentFactions: {
    type: [String],
    default: []
  },
  // Забаненные фракции
  creatorBannedFaction: String,
  opponentBannedFaction: String,
  // Оставшиеся фракции
  creatorRemainingFactions: {
    type: [String],
    default: []
  },
  opponentRemainingFactions: {
    type: [String],
    default: []
  },
  // Результаты раундов
  rounds: {
    type: [RoundSchema],
    default: []
  },
  // Итоговый победитель
  winner: {
    type: String,
    enum: ['creator', 'opponent', 'draw', null],
    default: null
  },
  // Счет
  score: {
    creator: { type: Number, default: 0 },
    opponent: { type: Number, default: 0 }
  },
  // Жеребьевка монеты
  coinFlip: {
    creatorCoin: { type: String, enum: ['blue', 'red'] },
    opponentCoin: { type: String, enum: ['blue', 'red'] }
  },
  // Время завершения
  completedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Индексы для оптимизации запросов
MatchSchema.index({ 'creator.id': 1, completedAt: -1 });
MatchSchema.index({ 'opponent.id': 1, completedAt: -1 });
MatchSchema.index({ completedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // TTL: 30 дней

// Метод для добавления результата раунда
MatchSchema.methods.addRoundResult = function(roundData) {
  this.rounds.push({
    roundNumber: this.rounds.length + 1,
    ...roundData
  });
  
  // Обновляем счет
  if (roundData.winner === 'creator') {
    this.score.creator++;
  } else if (roundData.winner === 'opponent') {
    this.score.opponent++;
  }
  
  return this;
};

// Статический метод для получения истории матчей игрока
MatchSchema.statics.getPlayerHistory = async function(playerId, limit = 10) {
  return this.find({
    $or: [
      { 'creator.id': playerId },
      { 'opponent.id': playerId }
    ]
  })
  .sort({ completedAt: -1 })
  .limit(limit)
  .lean();
};

module.exports = mongoose.model('Match', MatchSchema);
