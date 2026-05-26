import { createSelector, createSlice } from '@reduxjs/toolkit';
import { FIREBASE_DOC_KEY, FIREBASE_KEYS, FirebaseConfig } from './config';
const initialState = {
  localDbInfo: {},
  localDbData: {},
  myName: '',
  initFirebase: false,
  firebaseConfig: null,
};
const firebaseSlice = createSlice({
  name: 'firebase',
  initialState,
  reducers: {
    setFirebaseSettingAll: (state, action) => {
      return { ...state, ...action.payload };
    },
    setLocalDbInfo: (state, action) => {
      state.localDbInfo = { ...state.localDbInfo, ...action.payload };
    },
    setLocalDbData: (state, action) => {
      state.localDbData = { ...state.localDbData, ...action.payload };
    },
    setInitFirebase: (state, action) => {
      state.initFirebase = action.payload;
    },
    setFirebaseConfig: (state, action) => {
      state.firebaseConfig = action.payload;
    },
  },
});
export const getMyDevice = createSelector(
  (state) => state.firebase.localDbData?.device,
  (state) => state.setting.myName,
  (deviceObj, myName) => {
    return deviceObj?.[myName];
  },
);
export const getDeviceArray = createSelector(
  [(state) => state.firebase.localDbData?.device],
  (deviceObj) => {
    if (!deviceObj) return [];
    return Object.entries(deviceObj).map(([key, value]) => ({
      [FIREBASE_DOC_KEY]: key,
      ...value,
    }));
  },
);
export const getAllHistoryDates = createSelector(
  [(state) => state.firebase.localDbData],
  (localDbData) => {
    const dateArr = Object.entries(localDbData)
      .map(([key, value]) => {
        const toRemove = `${FIREBASE_KEYS.COLLECTION_HISTORY}_`;
        if (!key.startsWith(toRemove)) return false;
        return key.replace(toRemove, '');
      })
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : -1));
    return dateArr;
  },
);
export const getFavouriteArray = createSelector(
  [(state) => state.firebase.localDbData?.favourite],
  (favouriteObj) => {
    if (!favouriteObj) return [];
    return Object.entries(favouriteObj)
      .map(([key, value]) => ({
        [FIREBASE_DOC_KEY]: key,
        ...value,
      }))
      .sort((a, b) => (a?.watchTime > b?.watchTime ? 1 : -1));
  },
);
export const getHistoryRange = createSelector(
  [
    (state) => state.firebase.localDbData,
    (state) => state.playlist.historyToDate,
  ],
  (localDbData, toDate) => {
    const sectionArr = Object.entries(localDbData)
      .filter(([key, value]) => {
        const toRemove = `${FIREBASE_KEYS.COLLECTION_HISTORY}_`;
        if (!key.startsWith(toRemove)) return false;
        if (toDate && key.replace(toRemove, '') < toDate) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .map((obj) => {
        const [key, value] = obj;
        return Object.entries(value)
          .map(([url, data]) => {
            if (typeof data === 'object' && data.title && data.watchTime) {
              return {
                ...data,
                [FIREBASE_DOC_KEY]: url,
                watchTime: new Date(data.watchTime).getTime(),
              };
            } else {
              return null;
            }
          })
          .filter(Boolean)
          .sort((a, b) => (a.watchTime > b.watchTime ? -1 : 1));
      });
    const foundUrl = {};
    const resultArr = [],
      duplicateArr = [];
    sectionArr.flat().forEach((a) => {
      if (foundUrl[a[FIREBASE_DOC_KEY]]) {
        duplicateArr.push(a);
      } else {
        resultArr.push(a);
        foundUrl[a[FIREBASE_DOC_KEY]] = true;
      }
    });
    return { resultArr, duplicateArr };
  },
);
export const {
  setFirebaseSettingAll,
  setLocalDbData,
  setLocalDbInfo,
  setMyName,
  setInitFirebase,
  setFirebaseConfig,
} = firebaseSlice.actions;
export const firebaseReducer = firebaseSlice.reducer;
