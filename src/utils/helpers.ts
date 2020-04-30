import deepEqual = require("deep-equal");

export function duplicateRecordComparator(a: any): (b: any) => boolean {
  return b => a.type === b.type && a.name === b.name && deepEqual(a.data, b.data);
}

export function uniqueComparator(): (obj: any) => boolean {
  const set: any[] = [];

  return obj => {
    if (~set.indexOf(obj)) {
      return false;
    }

    set.push(obj);
    return true;
  };
}
