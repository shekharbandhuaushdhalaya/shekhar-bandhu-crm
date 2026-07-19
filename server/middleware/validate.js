/**
 * Express middleware factory for Zod schema validation.
 * Usage: router.post('/', validate(schema), handler)
 *
 * Supports both `body` only and `params + body` validation.
 * Pass true as second arg to validate req.params instead of req.body.
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const data = target === 'body' ? req.body : req.params;
    const result = schema.safeParse(data);
    if (!result.success) {
      const formatted = result.error.flatten();
      return res.status(400).json({
        error: 'Validation failed',
        fields: formatted.fieldErrors,
        issues: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    // Replace raw body with parsed + defaulted data
    if (target === 'body') req.body = result.data;
    next();
  };
}

module.exports = { validate };
