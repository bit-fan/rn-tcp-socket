import { createSelector, createSlice } from '@reduxjs/toolkit';
import { FIREBASE_DOC_KEY, FirebaseConfig } from './config';
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
    console.log('deviceObj, myName', deviceObj, myName);
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
export const {
  setFirebaseSettingAll,
  setLocalDbData,
  setLocalDbInfo,
  setMyName,
  setInitFirebase,
  setFirebaseConfig,
} = firebaseSlice.actions;
export const firebaseReducer = firebaseSlice.reducer;
