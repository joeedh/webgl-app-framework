function gen(): Array<number[]> {
  let ret: Array<number[]> = [];

  for (let i = 1; i < 10; i++) {
    let list = [];
    let n = i;
    let prod = 1.0;

    let k = 1.0;

    for (let j = 0; j < i; j++) {
      prod *= n;
      n--;

      let prodk = 1.0;

      for (let k = 0; k < j; k++) {
        prodk *= k + 1;
      }


      list.push(prod / prodk);
    }

    n = list[0];
    for (let j = 0; j < list.length; j++) {
      list[j] /= n;
    }

    ret.push(list);
  }

  return ret;
}

export const BinomialTable = gen();

export function printTable(): void {
  let rows = [];
  let maxlen = 0;
  for (let row of BinomialTable) {
    let s = "";
    for (let i of row) {
      let si = "" + i;
      while (si.length < 3) {
        si = " " + si
      }
      s += "" + si + " "
    }

    rows.push(s)
    maxlen = Math.max(maxlen, s.length);
  }

  let i = 0;
  for (let row of rows) {
    let n = rows.length - i;
    n *= 2

    for (let j = 0; j < n; j++) {
      row = " " + row;
    }
    console.log(row)
    i++;
  }
}
