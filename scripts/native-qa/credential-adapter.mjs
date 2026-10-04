// Synthetic QA only. Imported by the separate QA entry, never production main.
// Authentication is an in-memory fixture; OS credential storage is unavailable.
export function installSyntheticCredentials(safeStorage) {
  const deny = () => { throw new Error('Synthetic QA forbids credential encryption, decryption and OS storage access'); };
  const methods = {
    isEncryptionAvailable: () => false,
    encryptString: deny,
    decryptString: deny,
    getSelectedStorageBackend: deny,
    setUsePlainTextEncryption: deny,
  };
  // Refuse an incompatible runtime before replacing any method or loading main.
  for (const name of Object.keys(methods)) {
    const descriptor = Object.getOwnPropertyDescriptor(safeStorage, name);
    if (descriptor && !descriptor.configurable && !descriptor.writable) throw new Error(`Cannot isolate synthetic credentials: ${name}`);
    if (!descriptor && !Object.isExtensible(safeStorage)) throw new Error(`Cannot isolate synthetic credentials: ${name}`);
  }
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(safeStorage, name, { value: method, writable: false, configurable: false });
  }
  return Object.freeze({
    kind: 'synthetic in-memory session; OS credential storage unavailable',
    session(handler) {
      return (event, ...args) => {
        // The production handler still validates sender/frame before success.
        handler(event, ...args);
        return true;
      };
    },
  });
}
