export function bez3(a, b, c, t) {
  var r1 = a + (b - a)*t;
  var r2 = b + (c - b)*t;

  return r1 + (r2 - r1)*t;
}

export function bez4(a, b, c, d, t) {
  var r1 = bez3(a, b, c, t);
  var r2 = bez3(b, c, d, t);

  return r1 + (r2 - r1)*t;
}

