import { randomBytes, timingSafeEqual } from 'node:crypto'

export type LoopbackBindAddress = '127.0.0.1' | '::1'
export type RuntimeSecurityPolicy = 'read' | 'mutation'

export interface RuntimeSecurityRequest {
  readonly host?: string
  readonly origin?: string
  readonly runtimeToken?: string
}

export interface RuntimeSecurityOptions {
  readonly bindAddress?: string
  readonly expectedOrigin: string
}

export class RuntimeSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeSecurityError'
  }
}

export function assertLoopbackBindAddress(bindAddress = '127.0.0.1'): LoopbackBindAddress {
  if (bindAddress !== '127.0.0.1' && bindAddress !== '::1') throw new RuntimeSecurityError('Runtime must bind to loopback only')
  return bindAddress
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (typeof host !== 'string') return false
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || /^127\.0\.0\.1:\d{1,5}$/.test(normalized) || normalized === '[::1]' || /^\[::1\]:\d{1,5}$/.test(normalized)
}

function validateExpectedOrigin(expectedOrigin: string): void {
  let parsed: URL
  try { parsed = new URL(expectedOrigin) } catch { throw new RuntimeSecurityError('Expected origin must be an absolute origin') }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== expectedOrigin || !isLoopbackHost(parsed.host)) throw new RuntimeSecurityError('Expected origin must be an exact loopback origin')
}

/** Local runtime request checks; the nonce is process-scoped and never persisted. */
export class RuntimeSecurity {
  readonly bindAddress: LoopbackBindAddress
  readonly expectedOrigin: string
  private readonly token: Buffer

  constructor(options: RuntimeSecurityOptions) {
    this.bindAddress = assertLoopbackBindAddress(options.bindAddress)
    validateExpectedOrigin(options.expectedOrigin)
    this.expectedOrigin = options.expectedOrigin
    this.token = randomBytes(32)
  }

  get runtimeToken(): string { return this.token.toString('hex') }

  validateRequest(request: RuntimeSecurityRequest, policy: RuntimeSecurityPolicy = 'mutation'): void {
    if (!isLoopbackHost(request.host) || request.host !== new URL(this.expectedOrigin).host) throw new RuntimeSecurityError('Host is not the expected loopback host')
    if (request.origin !== this.expectedOrigin) throw new RuntimeSecurityError('Origin is not allowed')
    if (policy === 'mutation' && !this.matchesToken(request.runtimeToken)) throw new RuntimeSecurityError('Runtime token is missing or invalid')
  }

  corsHeaders(): Readonly<Record<string, string>> {
    return { 'Access-Control-Allow-Origin': this.expectedOrigin, Vary: 'Origin' }
  }

  private matchesToken(candidate: string | undefined): boolean {
    if (typeof candidate !== 'string' || !/^[0-9a-f]{64}$/i.test(candidate)) return false
    const received = Buffer.from(candidate, 'hex')
    return received.length === this.token.length && timingSafeEqual(received, this.token)
  }
}
