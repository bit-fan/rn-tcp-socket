import {
  get,
  getDatabase,
  onValue,
  ref,
  update,
  serverTimestamp,
} from 'firebase/database';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIREBASE_DOC_KEY, FIREBASE_KEYS, UpdatDbInfoObj } from './config';
import { storeFBError } from './util';
export const useWatchFBValue = ({ root, path = '' }, options = {}) => {
  const { initFirebaseFlag = false } = options;
  const [snapshotData, setSnapshotData] = useState(null);
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!initFirebaseFlag) {
      setSnapshotData(null);
      setData(null);
      return;
    }
    const unsubscribe = onValue(
      ref(getDatabase(), [root, path].filter(Boolean).join('/')),
      (snapshot) => {
        if (!snapshot.exists()) return [];

        setSnapshotData(snapshot.val());
        const deviceArray = [];
        snapshot.forEach((child) => {
          deviceArray.push({
            [FIREBASE_DOC_KEY]: child.key,
            ...child.val(),
          });
        });
        setData(deviceArray);
      },
      (error) => {
        storeFBError(error);
      },
    );
    return () => unsubscribe();
  }, [initFirebaseFlag, root, path]);

  return { data, snapshotData };
};
export const useFirebaseWatchDB = ({
  dispatch,
  localDbData,
  setLocalDbData,
  setLocalDbInfo,
  initFirebaseFlag,
}) => {
  const { snapshotData: serverDbInfo } = useWatchFBValue(
    {
      root: FIREBASE_KEYS.DB_INFO,
    },
    { initFirebaseFlag },
  );
  console.log('serverDbInfo', serverDbInfo);
  const watchHistoryKeys = serverDbInfo
    ? Object.keys(serverDbInfo).filter((key) =>
        key.startsWith(FIREBASE_KEYS.COLLECTION_HISTORY),
      )
    : [];
  useWatchUpdateDB({
    dispatch,
    localDbData,
    serverDbInfo,
    dbName: useMemo(
      () => [
        FIREBASE_KEYS.COLLECTION_DEVICE,
        FIREBASE_KEYS.COLLECTION_FAVOURITE,
        ...watchHistoryKeys,
      ],
      [serverDbInfo],
    ),
    dispatchActions: { setLocalDbData, setLocalDbInfo },
  });

  console.log('localDbData', localDbData);
  console.log('serverDbInfo', serverDbInfo);
  return { serverDbInfo };
};
export const useWatchUpdateDB = ({
  dispatch,
  dbName,
  localDbInfo,
  serverDbInfo,
  dispatchActions: { setLocalDbData = () => {}, setLocalDbInfo = () => {} },
}) => {
  const localInfoRef = useRef(localDbInfo);
  useEffect(() => {
    localInfoRef.current = localDbInfo;
  }, [localDbInfo]);
  console.log('serverDbInfo, dbName', { serverDbInfo, dbName, localDbInfo });
  const fetchAndUpdateDb = useCallback(
    async (name) => {
      const serverTS = serverDbInfo[name]?.lastModified;
      const localTS = localInfoRef.current?.[name]?.lastModified;
      if (serverTS === localTS) return;
      try {
        const snapshot = await get(ref(getDatabase(), name));
        dispatch(
          setLocalDbData({ [name]: snapshot.exists() ? snapshot.val() : {} }),
        );
        dispatch(setLocalDbInfo({ [name]: { lastModified: serverTS } }));
      } catch (e) {
        storeFBError(e);
      }
    },
    [serverDbInfo, dispatch, setLocalDbData, setLocalDbInfo],
  );

  useEffect(() => {
    if (!serverDbInfo || !dbName) return;
    const runUpdates = async () => {
      if (Array.isArray(dbName)) {
        for (const name of dbName) {
          await fetchAndUpdateDb(name);
        }
      } else {
        await fetchAndUpdateDb(dbName);
      }
    };
    runUpdates();
  }, [serverDbInfo, dbName, fetchAndUpdateDb]);
  return {};
};
