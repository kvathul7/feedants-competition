/** Error carrying an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
  }

  static badRequest(code, message, details) { return new ApiError(400, code, message, details); }
  static unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required') { return new ApiError(401, code, message); }
  static forbidden(code, message) { return new ApiError(403, code, message); }
  static notFound(code, message) { return new ApiError(404, code, message); }
  static conflict(code, message, details) { return new ApiError(409, code, message, details); }
  static gone(code, message) { return new ApiError(410, code, message); }
  static tooMany(code, message) { return new ApiError(429, code, message); }
}
