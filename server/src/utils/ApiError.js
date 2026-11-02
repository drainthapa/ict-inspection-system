export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(msg = 'Invalid request', details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Please log in to continue') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have permission for this action') { return new ApiError(403, msg); }
  static notFound(msg = 'Record not found') { return new ApiError(404, msg); }
  static conflict(msg = 'This record conflicts with an existing one', details) { return new ApiError(409, msg, details); }
}
