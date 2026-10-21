// backend/src/domain/errors.js
// Errores de dominio puros: no conocen Express ni Prisma.
class DomainError extends Error {
  constructor(message, { status = 400, code = 'DOMAIN_ERROR', details = undefined } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.isDomainError = true;
  }
}

class ValidationError extends DomainError {
  constructor(message, options = {}) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', ...options });
  }
}

class NotFoundError extends DomainError {
  constructor(message, options = {}) {
    super(message, { status: 404, code: 'NOT_FOUND', ...options });
  }
}

class ForbiddenError extends DomainError {
  constructor(message, options = {}) {
    super(message, { status: 403, code: 'FORBIDDEN', ...options });
  }
}

class DuplicateOrderError extends DomainError {
  constructor(message, options = {}) {
    super(message, { status: 400, code: 'DUPLICATE_ORDER', ...options });
  }
}

class RevisionConflictError extends DomainError {
  constructor(message, options = {}) {
    super(message, { status: 500, code: 'REVISION_CONFLICT', ...options });
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  DuplicateOrderError,
  RevisionConflictError,
};
