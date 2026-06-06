const mongoose = require('mongoose');

const symptomMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    type: { type: String, default: 'question' },
    options: { type: [String], default: [] },
    selectedOptions: { type: [String], default: [] },
    imageUrl: { type: String, default: '' },
    triage: { type: mongoose.Schema.Types.Mixed, default: null },
    conditionClusters: { type: mongoose.Schema.Types.Mixed, default: null },
    actionPlan: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const symptomChatSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, required: true, index: true },
    title: { type: String, default: 'Symptom Check Session' },
    messages: { type: [symptomMessageSchema], default: [] },
    lastSaveTime: { type: Date, default: Date.now },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

symptomChatSchema.index({ user: 1, sessionId: 1 }, { unique: true, sparse: true });
symptomChatSchema.index({ sessionId: 1 }, { unique: true });
symptomChatSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('SymptomChat', symptomChatSchema);
