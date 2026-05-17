import { getDatabase, ref, serverTimestamp, update } from 'firebase/database';
import { useEffect, useRef } from 'react';
import { FIREBASE_DOC_KEY, FIREBASE_KEYS } from './config';
import { setLocalDbInfo } from './firebaseSlice';

export const useFirebaseProgress = ({
  dispatch,
  playlist,
  props,
  myName,
  interval = 10000,
}) => {
  const propsRef = useRef(props);
  const playlistRef = useRef(playlist);
  const myNameRef = useRef(myName);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);
  const updateProgress = async (isSyncDb) => {
    const payload = constructProgressPayload(
      propsRef.current,
      myNameRef.current,
      playlistRef.current,
      isSyncDb,
    );
    if (!isSyncDb) {
      updateLocalDb(dispatch, payload);
    }
    await update(ref(getDatabase()), payload);
  };
  useEffect(() => {
    if (!props.url || propsRef.current?.isPaused) return;
    const int = setInterval(() => {
      if (
        propsRef.current?.progress &&
        propsRef.current?.duration &&
        myNameRef.current
      ) {
        updateProgress(false);
      }
    }, interval);
    return () => {
      clearInterval(int);
      updateProgress(true);
    };
  }, [props.url]);
  useEffect(() => {
    if (playlist[FIREBASE_DOC_KEY]) {
      updateProgress(true);
    }
  }, [playlist?.curIdx]);
};

const updateLocalDb = (dispatch, updates) => {
  const dbUpdates = {};
  Object.keys(updates)
    .filter((key) => key.startsWith(FIREBASE_KEYS.DB_INFO))
    .map((key) => key.replace(FIREBASE_KEYS.DB_INFO + '/', ''))
    .map((key) => {
      dbUpdates[key] = { lastModified: Date.now() + 6000 };
    });
  dispatch(setLocalDbInfo(dbUpdates));
};
const constructProgressPayload = (videoInfo, myName, playlist, isSyncDb) => {
  const updates = {};
  const updateDbInfo = {
    lastModified: serverTimestamp(),
  };
  const time = new Date();
  const { duration, progress = 0, source, title, url } = videoInfo;

  const videoKey = getSelectionKey(videoInfo, myName);
  const dbName = getDBName(time);
  updates[`${FIREBASE_KEYS.COLLECTION_HISTORY}_${dbName}/${videoKey}`] = {
    duration,
    progress,
    source: myName,
    title,
    url,
    watchTime: time.getTime(),
  };
  if (playlist[FIREBASE_DOC_KEY]) {
    const { [FIREBASE_DOC_KEY]: docId, ...rest } = playlist;
    updates[`${FIREBASE_KEYS.COLLECTION_FAVOURITE}/${docId}`] = rest;
    if (isSyncDb) {
      updates[
        `${FIREBASE_KEYS.DB_INFO}/${FIREBASE_KEYS.COLLECTION_FAVOURITE}`
      ] = {
        lastModified: serverTimestamp(),
      };
    }
  }
  if (isSyncDb) {
    updates[
      `${FIREBASE_KEYS.DB_INFO}/${FIREBASE_KEYS.COLLECTION_HISTORY}_${dbName}`
    ] = {
      lastModified: serverTimestamp(),
    };
  }
  return updates;
};
const getSelectionKey = (data, myName) =>
  data.url.replace(/[.#$/[\]]/g, '_') + '_' + (myName || 'unknown');
export const getDBName = (date) => {
  return [date.getFullYear(), `0${date.getMonth()}`.slice(-2)].join('_');
};
