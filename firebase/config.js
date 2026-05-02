import { serverTimestamp } from "firebase/database";

export const FIREBASE_DOC_KEY = 'FB_ID';
export const FB_SERVER_DEVICE_ID = 999;
export const FIREBASE_KEYS = {
  COLLECTION_HISTORY: 'watchHistory',
  COLLECTION_DEVICE: 'device',
  COLLECTION_FAVOURITE: 'favourite',
  DB_INFO: 'dbInfo',
};
export const UpdatDbInfoObj = (dbname) => {
  return {
    [FIREBASE_KEYS.DB_INFO + '/' + dbname]: { lastModified: serverTimestamp() },
  };
};
