/**
 * Throw this inside a database transaction to roll it back and answer with a specific status.
 * Route handlers catch it outside the transaction and turn it into a reply.
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}