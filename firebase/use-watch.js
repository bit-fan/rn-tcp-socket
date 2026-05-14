import {
  get,
  getDatabase,
  onValue,
  ref,
  update,
  serverTimestamp,
  remove,
  orderByChild,
  query,
} from 'firebase/database';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIREBASE_DOC_KEY, FIREBASE_KEYS, UpdatDbInfoObj } from './config';
import { storeFBError } from './util';
import { setLocalDbData, setLocalDbInfo } from './firebaseSlice';
import { useDispatch, useSelector } from 'react-redux';
export const useWatchFBValue = ({ root, path = '' }, options = {}) => {
  const { initFirebaseFlag = false } = options;
  const [snapshotData, setSnapshotData] = useState(null);
  const [data, setData] = useState(null);
  const fullPath = [root, path].filter(Boolean).join('/');
  useEffect(() => {
    if (!initFirebaseFlag) {
      setSnapshotData(null);
      setData(null);
      return;
    }
    const unsubscribe = onValue(
      ref(getDatabase(), fullPath),
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
        storeFBError(error, { useWatchFBValue: '', fullPath });
      },
    );
    return () => unsubscribe();
  }, [initFirebaseFlag, fullPath]);
  return { data, snapshotData };
};
export const useFirebaseWatchDB = () => {
  const dispatch = useDispatch();
  const localDbInfo = useSelector((s) => s.firebase.localDbInfo);
  const localDbInfoRef = useRef(localDbInfo);
  const getLocalDbInfo = () => localDbInfoRef.current;
  const getActions = () => actionsRef.current;
  const actionsRef = useRef({ setLocalDbData, setLocalDbInfo });
  useEffect(() => {
    localDbInfoRef.current = localDbInfo;
  }, [localDbInfo]);
  useEffect(() => {
    actionsRef.current = { setLocalDbData, setLocalDbInfo };
  }, [setLocalDbData, setLocalDbInfo]);
  const initFirebaseFlag = useSelector((s) => s.firebase.initFirebase);
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
          (serverTS > localTS || !localTS) &&
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
export const useWatchDeviceCommand = ({
  device,
  commandCallback,
  timeThresholdMs = 60000,
}) => {
  const callbackRef = useRef(commandCallback);
  const seenIds = useRef(new Set());

  useEffect(() => {
    callbackRef.current = commandCallback;
  }, [commandCallback]);

  useEffect(() => {
    if (!device) return;

    const db = getDatabase();
    const commandPath = `${FIREBASE_KEYS.COLLECTION_DEVICE}_${device}`;
    const commandQuery = query(ref(db, commandPath), orderByChild('timestamp'));

    const unsubscribe = onValue(
      commandQuery,
      async (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const now = Date.now();
        const freshCommands = [];
        const expiredUpdates = {};

        snapshot.forEach((child) => {
          const commandKey = child.key;
          const data = child.val();
          const timestamp = data.timestamp || now;

          if (now - timestamp > timeThresholdMs) {
            expiredUpdates[commandKey] = null;
            return;
          }
          if (!seenIds.current.has(commandKey)) {
            seenIds.current.add(commandKey);
            freshCommands.push({
              [FIREBASE_DOC_KEY]: commandKey,
              data: { ...data },
              ack: async () => {
                try {
                  await update(ref(db, commandPath), { [commandKey]: null });
                } catch (e) {
                  storeFBError(error, {
                    onclearingcommand: '',
                    device,
                    commandKey,
                  });
                }
              },
            });
          }
        });
        if (Object.keys(expiredUpdates).length > 0) {
          try {
            await update(ref(db, commandPath), expiredUpdates);
          } catch (e) {
            storeFBError(e, {
              type: 'Batch expiry failed',
              expiredUpdates,
            });
          }
        }
        if (freshCommands.length > 0 && callbackRef.current) {
          callbackRef.current(freshCommands);
        }
      },
      (error) => {
        storeFBError(error, { ondeviceCommand: '', device });
      },
    );

    return () => {
      unsubscribe();
      seenIds.current.clear();
    };
  }, [device, timeThresholdMs]);
};
