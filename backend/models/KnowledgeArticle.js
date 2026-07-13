const mongoose = require('mongoose')

const knowledgeArticleSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  urlName: { type: String, required: true, trim: true, maxlength: 300 },
  body: { type: String, trim: true, default: '', maxlength: 50000 },
  summary: { type: String, trim: true, default: '', maxlength: 500 },
  articleNumber: { type: String, trim: true, maxlength: 20 },
  publicationStatus: {
    type: String,
    enum: ['Draft', 'Published'],
    default: 'Draft',
  },
  validationStatus: {
    type: String,
    enum: ['Not Validated', 'Validated'],
    default: 'Not Validated',
  },
  visibleInternal: { type: Boolean, default: true },
  visibleCustomer: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
}, { timestamps: true })

knowledgeArticleSchema.index({ workspaceId: 1, title: 1 })
knowledgeArticleSchema.index({ workspaceId: 1, articleNumber: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('KnowledgeArticle', knowledgeArticleSchema)
