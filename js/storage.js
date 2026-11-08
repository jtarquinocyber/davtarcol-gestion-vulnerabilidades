const DATABASE_NAME = "SentinelRiskDB";
const DATABASE_VERSION = 1;
const STORE_NAME = "findings";
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB no está disponible en este navegador."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      for (const index of ["severity", "source", "category", "asset", "status"]) {
        if (!store.indexNames.contains(index)) store.createIndex(index, index, { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("No se pudo abrir la base de datos local."));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("La actualización de la base de datos está bloqueada por otra pestaña."));
    };
  });
  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Error en la transacción local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("La transacción local fue cancelada."));
  });
}

export async function getAllFindings() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).getAll();
  const done = transactionDone(transaction);
  const findings = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudieron leer los hallazgos."));
  });
  await done;
  return findings;
}

export async function upsertFindings(findings) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const uniqueFindings = new Map(findings.map((finding) => [finding.id, finding]));
  const counts = { inserted: 0, duplicates: findings.length - uniqueFindings.size };
  const orderedFindings = [...uniqueFindings.values()];
  let index = 0;
  const writeNext = () => {
    if (index >= orderedFindings.length) return;
    const finding = orderedFindings[index];
    index += 1;
    const request = store.get(finding.id);
    request.onsuccess = () => {
      const existing = request.result;
      if (existing) {
        counts.duplicates += 1;
        store.put({
          ...existing,
          ...finding,
          dateIngested: existing.dateIngested,
          lastScanned: finding.lastScanned ?? finding.dateIngested
        });
      } else {
        counts.inserted += 1;
        store.add(finding);
      }
      writeNext();
    };
  };
  writeNext();
  await transactionDone(transaction);
  return counts;
}

export async function updateFindingStatus(id, status) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.get(id);
  const done = transactionDone(transaction);
  await new Promise((resolve, reject) => {
    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error("El hallazgo ya no existe en el almacenamiento local."));
        return;
      }
      store.put({ ...request.result, status, lastScanned: new Date().toISOString() });
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error("No se pudo actualizar el estado."));
  });
  await done;
}

export async function clearFindings() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const request = transaction.objectStore(STORE_NAME).clear();
  const done = transactionDone(transaction);
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("No se pudieron vaciar los hallazgos."));
  });
  await done;
}
