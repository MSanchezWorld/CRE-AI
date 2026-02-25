// Stub module for @react-native-async-storage/async-storage.
//
// Some wagmi connectors pull in @metamask/sdk which references this React Native
// dependency. It's not needed for the BorrowBot web demo, but bundlers can try
// to resolve it during builds. This shim keeps builds clean.

type Key = string;
type Value = string;

const AsyncStorage = {
  async getItem(_key: Key): Promise<Value | null> {
    return null;
  },
  async setItem(_key: Key, _value: Value): Promise<void> {},
  async removeItem(_key: Key): Promise<void> {},
  async clear(): Promise<void> {}
};

export default AsyncStorage;
export { AsyncStorage };

