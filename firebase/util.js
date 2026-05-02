import { getDatabase, push, ref, update } from 'firebase/database';
import { UpdatDbInfoObj } from './config';

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
