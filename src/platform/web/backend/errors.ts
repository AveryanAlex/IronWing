export class WebBackendUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebBackendUnsupportedError";
  }
}
