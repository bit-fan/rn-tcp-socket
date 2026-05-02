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
  const dispatchActions = useMemo(() => {
    return { setLocalDbData, setLocalDbInfo };
  }, [setLocalDbData, setLocalDbInfo]);
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
    dispatchActions,
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
  dispatchActions,
}) => {
  const processingRef = useRef(new Set());
  const localInfoRef = useRef(localDbInfo);
  useEffect(() => {
    localInfoRef.current = localDbInfo;
  }, [localDbInfo]);
  console.log('serverDbInfo, dbName', { serverDbInfo, dbName, localDbInfo });
  const actionsRef = useRef(dispatchActions);
  useEffect(() => {
    actionsRef.current = dispatchActions;
  }, [dispatchActions]);
  const fetchAndUpdateDb = useCallback(
    async (name) => {
      const serverTS = serverDbInfo[name]?.lastModified;
      const localTS = localInfoRef.current?.[name]?.lastModified;
      if (!serverTS || serverTS === localTS) return;
      try {
        const snapshot = await get(ref(getDatabase(), name));
        dispatch(
          actionsRef.current.setLocalDbData({ [name]: snapshot.val() || {} }),
        );
        dispatch(
          actionsRef.current.setLocalDbInfo({
            [name]: { lastModified: serverTS },
          }),
        );
      } catch (e) {
        storeFBError(e);
      }
    },
    [serverDbInfo, dispatch],
  );

  useEffect(() => {
    if (!serverDbInfo || !dbName) return;
    const runUpdates = async () => {
      const names = Array.isArray(dbName) ? dbName : [dbName];
      for (const name of names) {
        const serverTS = serverDbInfo[name]?.lastModified;
        const localTS = localInfoRef.current?.[name]?.lastModified;
        if (
          serverTS &&
          serverTS !== localTS &&
          !processingRef.current.has(name)
        ) {
          processingRef.current.add(name);
          await fetchAndUpdateDb(name);
          processingRef.current.delete(name);
        }
      }
    };
    runUpdates();
  }, [serverDbInfo, JSON.stringify(dbName), fetchAndUpdateDb]);
  return {};
};
