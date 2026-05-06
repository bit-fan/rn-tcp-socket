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
        if (!snapshot.exists()) {
          setSnapshotData(null);
          setData([]);
          return;
        }
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
        storeFBError(error, { useWatchFBValue: '', root, path });
      },
    );
    return () => unsubscribe();
  }, [initFirebaseFlag, root, path]);
  return { data, snapshotData };
};
export const useFirebaseWatchDB = ({
  dispatch,
  getLocalDbInfo,
  getActions,
  initFirebaseFlag,
}) => {
  const { snapshotData: serverDbInfo } = useWatchFBValue(
    { root: FIREBASE_KEYS.DB_INFO },
    { initFirebaseFlag },
  );
  const watchHistoryKeys = useMemo(() => {
    if (!serverDbInfo) return [];
    return Object.keys(serverDbInfo).filter((key) =>
      key.startsWith(FIREBASE_KEYS.COLLECTION_HISTORY),
    );
  }, [serverDbInfo]);
  const stableDbNames = useMemo(
    () => [
      FIREBASE_KEYS.COLLECTION_DEVICE,
      FIREBASE_KEYS.COLLECTION_FAVOURITE,
      ...watchHistoryKeys,
    ],
    [watchHistoryKeys],
  );
  useWatchUpdateDB({
    dispatch,
    dbName: stableDbNames, // Pass the stable memoized array
    getLocalDbInfo,
    serverDbInfo,
    getActions,
  });
  return { serverDbInfo };
};
export const useWatchUpdateDB = ({
  dispatch,
  dbName,
  getLocalDbInfo,
  serverDbInfo,
  getActions,
}) => {
  const processingRef = useRef(new Set());
  const fetchAndUpdateDb = useCallback(
    async (name, serverTS) => {
      try {
        const snapshot = await get(ref(getDatabase(), name));
        const data = snapshot.val() || {};
        dispatch(getActions()?.setLocalDbData({ [name]: data }));
        dispatch(
          getActions()?.setLocalDbInfo({ [name]: { lastModified: serverTS } }),
        );
      } catch (e) {
        storeFBError(e);
      }
    },
    [dispatch],
  );
  useEffect(() => {
    if (!serverDbInfo || !dbName) return;
    const runUpdates = async () => {
      for (const name of dbName) {
        const serverTS = serverDbInfo[name]?.lastModified;
        const localTS = getLocalDbInfo()?.[name]?.lastModified; // Use prop directly for comparison
        if (
          serverTS &&
          serverTS !== localTS &&
          !processingRef.current.has(name)
        ) {
          processingRef.current.add(name);
          await fetchAndUpdateDb(name, serverTS);
          processingRef.current.delete(name);
        }
      }
    };
    runUpdates();
  }, [serverDbInfo, dbName, fetchAndUpdateDb]);
  return {};
};
