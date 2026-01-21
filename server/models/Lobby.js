const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: 'Игрок' }
}, { _id: false });

const LobbySchema = new mongoose.Schema({
  lobbyCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  creator: {
    type: PlayerSchema,
    required: true
  },
  opponent: {
    type: PlayerSchema,
    default: null
  },
  spectators: {
    type: [PlayerSchema],
    default: []
  },
  tournamentFormat: {
    type: String,
    enum: ['bo3', 'bo5'],
    default: 'bo3'
  },
  status: {
    type: String,
    enum: ['waiting', 'selecting-factions', 'banning', 'match-results'],
    default: 'waiting',
    index: true
  },
  // Выбранные фракции
  creatorSelectedFactions: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 4; // Максимум 4 для bo5
      },
      message: 'Максимум 4 фракции'
    }
  },
  opponentSelectedFactions: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 4;
      },
      message: 'Максимум 4 фракции'
    }
  },
  // Забаненные фракции
  creatorBannedFaction: {
    type: String,
    default: null
  },
  opponentBannedFaction: {
    type: String,
    default: null
  },
  // Оставшиеся фракции после бана
  creatorRemainingFactions: {
    type: [String],
    default: []
  },
  opponentRemainingFactions: {
    type: [String],
    default: []
  },
  // Время последней активности
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Время создания
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expireAfterSeconds: 10800 } // TTL: автоудаление через 3 часа
  }
}, {
  timestamps: false,
  versionKey: false
});

// Составной индекс для эффективных запросов
LobbySchema.index({ status: 1, lastActivity: -1 });

// Виртуальное поле для проверки готовности
LobbySchema.virtual('isReady').get(function() {
  return this.creator && this.opponent && this.creator.id && this.opponent.id;
});

// Виртуальное поле для количества игроков
LobbySchema.virtual('playerCount').get(function() {
  let count = 0;
  if (this.creator?.id) count++;
  if (this.opponent?.id) count++;
  return count;
});

// Метод для проверки, является ли игрок участником
LobbySchema.methods.isParticipant = function(playerId) {
  return (this.creator?.id === playerId) || (this.opponent?.id === playerId);
};

// Метод для получения роли игрока
LobbySchema.methods.getPlayerRole = function(playerId) {
  if (this.creator?.id === playerId) return 'creator';
  if (this.opponent?.id === playerId) return 'opponent';
  return null;
};

// Middleware для обновления lastActivity
LobbySchema.pre('save', function(next) {
  if (this.isModified() && !this.isModified('lastActivity')) {
    this.lastActivity = new Date();
  }
  next();
});

// Статический метод для очистки старых лобби
LobbySchema.statics.cleanupOldLobbies = async function(hoursOld = 3) {
  const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  const result = await this.deleteMany({ lastActivity: { $lt: cutoffTime } });
  return result.deletedCount;
};

// JSON трансформация для API ответов
LobbySchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    return ret;
  }
});

module.exports = mongoose.model('Lobby', LobbySchema);
