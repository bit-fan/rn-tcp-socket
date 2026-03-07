// Central default values for the package
export const DEFAULT_SCAN_CONCURRENCY = 7; // preferred default for phone scanning a LAN TV host
export const DEFAULT_SCAN_TIMEOUT_MS = 700; // per-attempt timeout in ms

// Shared default port for server/client
export const DEFAULT_PORT = 12345;

// Default /24 prefix to scan when caller doesn't provide one
export const DEFAULT_PREFIX = '192.168.1.*';

// Re-export or add other shared defaults here in future if needed.
