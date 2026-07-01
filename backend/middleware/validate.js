const Joi = require('joi')

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true })
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((d) => d.message).join('; '),
      })
    }
    req.body = value
    next()
  }
}

module.exports = { Joi, validateBody }
