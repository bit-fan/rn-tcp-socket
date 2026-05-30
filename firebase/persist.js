import { storeFBError } from './util';

const actions = [
  {
    type: '^setting\/(?!setSettingAll)',
    storageKey: 'SETTING_DEVICE',
    data: (state) => state.setting,
    setter: (data) => (data) => {
      return data;
    },
  },
  {
    type: '^firebase\//(?!setInitFirebase)',
    storageKey: 'FIREBASE_DATA',
    data: (state) => state.firebase,
    setter: (data) => (data) => {
      const newData = { ...data };
      delete newData.initFirebase;
      return newData;
    },
  },
];
export const listenObj = (actions, AsyncStorage) => {
  const compiledActions = actions.map((item) => ({
    ...item,
    regex: new RegExp(item.type),
  }));
  return {
    predicate: (action) => {
      return compiledActions.some(({ regex }) => regex.test(action.type));
    },

    effect: async (action, listenerApi) => {
      const target = compiledActions.find(({ regex }) =>
        regex.test(action.type),
      );
      if (!target) return;
      try {
        const state = listenerApi.getState();
        const dataToSave = target.data(state);
        await AsyncStorage.setItem(
          target.storageKey,
          JSON.stringify(dataToSave),
        );
      } catch (error) {
        storeFBError({ error, saveasync: target });
      }
    },
  };
};

export const restoreFn = async (dispatch, AsyncStorage, actions) => {
  await Promise.all(
    actions.map(async (action) => {
      const data = await AsyncStorage.getItem(action.storageKey);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          dispatch(action.setter(parsed));
        } catch (parseError) {
          storeFBError({ error: parseError, restore: action.type });
        }
      }
    }),
  );
  return true;
};
