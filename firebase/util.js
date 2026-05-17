import {
  getDatabase,
  push,
  ref,
  serverTimestamp,
  update,
} from 'firebase/database';
import { FIREBASE_DOC_KEY, FIREBASE_KEYS, UpdatDbInfoObj } from './config';
import { getDBName } from './use-firebase-progress';

export const updateFirebaseDB = async (arr = []) => {
  try {
    const db = getDatabase();
    const updates = {};
    arr.forEach(({ key, value }) => {
      updates[key] = value;
      const [root] = key.split('/');
      Object.assign(updates, UpdatDbInfoObj(root));
    });
    await update(ref(db), updates);
  } catch (e) {
    storeFBError(e);
  }
};
export const removeProgressData = async (arr = []) => {
  try {
    const db = getDatabase();
    const updates = {};
    arr.forEach((obj) => {
      const { [FIREBASE_DOC_KEY]: fbKey, ...rest } = obj;
      const dbName = getDBName(new Date(rest.watchTime));
      updates[`${FIREBASE_KEYS.COLLECTION_HISTORY}_${dbName}/${fbKey}`] = null;

      updates[
        `${FIREBASE_KEYS.DB_INFO}/${FIREBASE_KEYS.COLLECTION_HISTORY}_${dbName}`
      ] = {
        lastModified: serverTimestamp(),
      };
    });
    await update(ref(db), updates);
  } catch (e) {
    storeFBError(e);
  }
};
export const storeFBError = async (e) => {
  try {
    const db = getDatabase();
    // push() generates a unique, timestamp-based key automatically
    await push(ref(db, 'errors/'), {
      message: e.message || 'Unknown Error',
      stack: e.stack || null,
      timestamp: new Date().toLocaleString(),
    });
  } catch (err) {
    console.error('Failed to log error to Firebase:', err);
  }
};

export const commandToDevice = async ({ device, type, data }) => {
  const db = getDatabase();

  const newCommand = {
    type,
    data,
    timestamp: serverTimestamp(),
  };

  try {
    const commandRef = ref(db, `${FIREBASE_KEYS.COLLECTION_DEVICE}_${device}`);
    const result = await push(commandRef, newCommand);
    return result.key;
  } catch (error) {
    console.error('Failed to send command to device:', device, error);
    throw error;
  }
};
